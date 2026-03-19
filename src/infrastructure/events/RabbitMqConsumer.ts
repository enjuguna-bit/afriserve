/**
 * RabbitMqConsumer
 *
 * Subscribes to the afriserve.domain.events topic exchange and routes
 * incoming messages to registered event handlers.
 *
 * Architecture fit:
 *   domainEventService.ts  — publishes events to the exchange (producer side)
 *   RabbitMqConsumer       — receives events from the exchange (consumer side)
 *   LoanNotificationSubscriber — registers handlers here exactly as it does
 *                               against the in-process IEventBus
 *
 * Exchange topology:
 *   Exchange : ${topicPrefix}.domain.events          (topic, durable)
 *   DLX      : ${topicPrefix}.domain.events.dead     (direct, durable)
 *   Queue    : ${queueName}  e.g. afriserve.notifications
 *              bound to exchange with routing key '#' (all events)
 *              x-dead-letter-exchange → DLX
 *              x-message-ttl          → 24 h (configurable)
 *
 * Reliability:
 *   - prefetch(1) + manual ack: one message at a time per consumer instance
 *   - ack on success, nack(requeue=false) after maxRetries → routed to DLX
 *   - exponential-backoff reconnect on connection/channel errors
 *   - stop() drains gracefully: cancels consumer, closes channel/connection
 *
 * Usage (bootstrap.ts):
 *   const consumer = new RabbitMqConsumer({ brokerUrl, topicPrefix, queueName, logger });
 *   const sub = new LoanNotificationSubscriber(notificationService, get);
 *   sub.register(consumer);          // same API as IEventBus.subscribe
 *   await consumer.start();
 */

import type { LoggerLike } from "../../types/runtime.js";

export type ConsumerEventHandler = (event: RabbitMqDomainEvent) => Promise<void>;

export interface RabbitMqDomainEvent {
  id: number;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: number | null;
  occurredAt: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface RabbitMqConsumerOptions {
  brokerUrl: string;
  /** Prefix used to derive exchange and DLX names. Default: "afriserve" */
  topicPrefix?: string;
  /** Queue name for this consumer. Default: "{topicPrefix}.notifications" */
  queueName?: string;
  /** Max delivery attempts before a message is dead-lettered. Default: 5 */
  maxRetries?: number;
  /** Message TTL on the DLQ in milliseconds. Default: 86_400_000 (24 h) */
  messageTtlMs?: number;
  /** Reconnect base delay in ms; doubles on each failure up to maxBackoffMs. Default: 2000 */
  reconnectBaseMs?: number;
  /** Maximum reconnect backoff in ms. Default: 60_000 */
  maxBackoffMs?: number;
  logger?: LoggerLike | null;
}

export class RabbitMqConsumer {
  private readonly _brokerUrl: string;
  private readonly _exchangeName: string;
  private readonly _dlxName: string;
  private readonly _queueName: string;
  private readonly _maxRetries: number;
  private readonly _messageTtlMs: number;
  private readonly _reconnectBaseMs: number;
  private readonly _maxBackoffMs: number;
  private readonly _logger: LoggerLike | null;

  private readonly _handlers = new Map<string, ConsumerEventHandler[]>();

  private _connection: any = null;
  private _channel: any = null;
  private _consumerTag: string | null = null;
  private _stopped = false;
  private _reconnectAttempts = 0;

  constructor(options: RabbitMqConsumerOptions) {
    const prefix = (options.topicPrefix ?? "afriserve").trim() || "afriserve";
    this._brokerUrl       = options.brokerUrl.trim();
    this._exchangeName    = `${prefix}.domain.events`;
    this._dlxName         = `${prefix}.domain.events.dead`;
    this._queueName       = (options.queueName ?? `${prefix}.notifications`).trim();
    this._maxRetries      = Math.max(1, options.maxRetries ?? 5);
    this._messageTtlMs    = options.messageTtlMs ?? 86_400_000;
    this._reconnectBaseMs = options.reconnectBaseMs ?? 2_000;
    this._maxBackoffMs    = options.maxBackoffMs ?? 60_000;
    this._logger          = options.logger ?? null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Register a handler for a specific event type.
   * Mirrors IEventBus.subscribe so LoanNotificationSubscriber.register()
   * can call this directly: sub.register(consumer).
   */
  subscribe(eventType: string, handler: ConsumerEventHandler): void {
    const list = this._handlers.get(eventType) ?? [];
    list.push(handler);
    this._handlers.set(eventType, list);
  }

  /** Start consuming. Reconnects automatically until stop() is called. */
  async start(): Promise<void> {
    this._stopped = false;
    await this._connectAndConsume();
  }

  /** Graceful shutdown — cancels the consumer and closes the connection. */
  async stop(): Promise<void> {
    this._stopped = true;
    try {
      if (this._channel && this._consumerTag) {
        await this._channel.cancel(this._consumerTag).catch(() => {});
      }
      if (this._channel) {
        await this._channel.close().catch(() => {});
      }
      if (this._connection) {
        await this._connection.close().catch(() => {});
      }
    } finally {
      this._channel = null;
      this._connection = null;
      this._consumerTag = null;
    }
    this._log("info", "rabbitmq.consumer.stopped", { queue: this._queueName });
  }

  // ── Connection & channel ─────────────────────────────────────────────────

  private async _connectAndConsume(): Promise<void> {
    if (this._stopped) return;

    try {
      const amqplib = await this._loadAmqplib();
      this._connection = await amqplib.connect(this._brokerUrl);

      this._connection.on("error", (err: Error) => {
        this._log("warn", "rabbitmq.consumer.connection_error", { error: err.message });
        this._scheduleReconnect();
      });
      this._connection.on("close", () => {
        if (!this._stopped) {
          this._log("warn", "rabbitmq.consumer.connection_closed");
          this._scheduleReconnect();
        }
      });

      this._channel = await this._connection.createChannel();
      this._channel.on("error", (err: Error) => {
        this._log("warn", "rabbitmq.consumer.channel_error", { error: err.message });
      });
      this._channel.on("close", () => {
        if (!this._stopped) {
          this._log("warn", "rabbitmq.consumer.channel_closed");
          this._scheduleReconnect();
        }
      });

      // Exchange + DLX + queue topology
      await this._channel.assertExchange(this._exchangeName, "topic", { durable: true });
      await this._channel.assertExchange(this._dlxName, "direct", { durable: true });

      const dlqName = `${this._queueName}.dead`;
      await this._channel.assertQueue(dlqName, { durable: true });
      await this._channel.bindQueue(dlqName, this._dlxName, this._queueName);

      await this._channel.assertQueue(this._queueName, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange":    this._dlxName,
          "x-dead-letter-routing-key": this._queueName,
          "x-message-ttl":             this._messageTtlMs,
        },
      });
      await this._channel.bindQueue(this._queueName, this._exchangeName, "#");

      // One message at a time — prevents a slow handler from starving the process
      await this._channel.prefetch(1);

      const { consumerTag } = await this._channel.consume(
        this._queueName,
        (msg: any) => this._handleMessage(msg),
        { noAck: false },
      );
      this._consumerTag = consumerTag;
      this._reconnectAttempts = 0;

      this._log("info", "rabbitmq.consumer.started", {
        queue:    this._queueName,
        exchange: this._exchangeName,
      });
    } catch (err) {
      this._log("warn", "rabbitmq.consumer.connect_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect(): void {
    if (this._stopped) return;
    this._channel    = null;
    this._connection = null;
    this._consumerTag = null;
    this._reconnectAttempts += 1;

    const delayMs = Math.min(
      this._reconnectBaseMs * (2 ** Math.min(this._reconnectAttempts - 1, 6)),
      this._maxBackoffMs,
    );
    this._log("info", "rabbitmq.consumer.reconnecting", {
      attempt: this._reconnectAttempts,
      delayMs,
    });
    const timer = setTimeout(() => this._connectAndConsume(), delayMs);
    if (typeof timer?.unref === "function") timer.unref();
  }

  // ── Message dispatch ─────────────────────────────────────────────────────

  private async _handleMessage(msg: any): Promise<void> {
    if (!msg) return; // null = consumer cancelled

    let event: RabbitMqDomainEvent | null = null;
    try {
      event = this._parseMessage(msg);
    } catch (parseErr) {
      // Unparseable message — dead-letter immediately, no retry
      this._log("warn", "rabbitmq.consumer.parse_error", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        content: msg.content?.toString("utf8").slice(0, 200),
      });
      this._channel?.nack(msg, false, false);
      return;
    }

    const deliveryCount = Number(msg.properties?.headers?.["x-delivery-count"] ?? 0);
    const handlers = this._handlers.get(event.eventType) ?? [];

    if (handlers.length === 0) {
      // No handler registered for this event type — ack and move on
      this._channel?.ack(msg);
      return;
    }

    try {
      for (const handler of handlers) {
        await handler(event);
      }
      this._channel?.ack(msg);
      this._log("info", "rabbitmq.consumer.event_handled", {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        tenantId: event.tenantId,
      });
    } catch (handlerErr) {
      const requeue = deliveryCount < this._maxRetries;
      this._log("warn", "rabbitmq.consumer.handler_error", {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        deliveryCount,
        maxRetries: this._maxRetries,
        requeue,
        error: handlerErr instanceof Error ? handlerErr.message : String(handlerErr),
      });
      this._channel?.nack(msg, false, requeue);
    }
  }

  private _parseMessage(msg: any): RabbitMqDomainEvent {
    const raw = JSON.parse(msg.content.toString("utf8")) as Record<string, any>;
    return {
      id:            Number(raw.id ?? 0),
      tenantId:      String(raw.tenantId ?? raw.tenant_id ?? "default"),
      eventType:     String(raw.eventType ?? raw.event_type ?? ""),
      aggregateType: String(raw.aggregateType ?? raw.aggregate_type ?? ""),
      aggregateId:   Number.isFinite(Number(raw.aggregateId ?? raw.aggregate_id))
                       ? Number(raw.aggregateId ?? raw.aggregate_id)
                       : null,
      occurredAt:    String(raw.occurredAt ?? raw.occurred_at ?? new Date().toISOString()),
      payload:       (raw.payload && typeof raw.payload === "object") ? raw.payload : {},
      metadata:      (raw.metadata && typeof raw.metadata === "object") ? raw.metadata : {},
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async _loadAmqplib(): Promise<any> {
    const mod = await import("amqplib").catch(() => null) as any;
    if (!mod || typeof mod.connect !== "function") {
      throw new Error(
        "RabbitMQ consumer: 'amqplib' is not installed. Run: npm install amqplib",
      );
    }
    return mod;
  }

  private _log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void {
    const method = this._logger?.[level];
    if (typeof method === "function") {
      method.call(this._logger, event, data);
    }
  }
}

/**
 * Factory — returns null when RabbitMQ is not configured, so callers can
 * skip setup without needing to check env vars themselves.
 */
export function createRabbitMqConsumer(
  options: RabbitMqConsumerOptions,
): RabbitMqConsumer | null {
  if (!options.brokerUrl.trim()) return null;
  return new RabbitMqConsumer(options);
}
