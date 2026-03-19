import type { LoggerLike } from "../types/runtime.js";

type EventBrokerProvider = "none" | "rabbitmq" | "kafka";

interface PublishDomainEventPayload {
  eventType: string;
  aggregateType: string;
  aggregateId: number | null | undefined;
  tenantId?: string | null | undefined;
  payload?: Record<string, unknown> | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  occurredAt?: string | null | undefined;
}

interface DomainEventServiceOptions {
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number }>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  logger?: LoggerLike | null;
  provider?: EventBrokerProvider;
  brokerUrl?: string;
  topicPrefix?: string;
  defaultTenantId?: string;
  maxAttempts?: number;
  dispatchInline?: boolean;
}

function createDomainEventService(options: DomainEventServiceOptions) {
  const {
    run,
    all,
    logger = null,
    provider = "none",
    brokerUrl = "",
    topicPrefix = "afriserve",
    defaultTenantId = "default",
    maxAttempts = 10,
    dispatchInline = true,
  } = options;

  async function publishDomainEvent(payload: PublishDomainEventPayload, tx?: any): Promise<number> {
    const createdAt = new Date().toISOString();
    const tenantId = String(payload.tenantId || defaultTenantId || "default");
    const eventType = String(payload.eventType || "").trim();
    const aggregateType = String(payload.aggregateType || "").trim();
    const aggregateId = Number.isFinite(Number(payload.aggregateId)) ? Number(payload.aggregateId) : null;
    const payloadJson = JSON.stringify(payload.payload || {});
    const metadataJson = JSON.stringify(payload.metadata || {});
    const occurredAt = String(payload.occurredAt || createdAt);

    const isPrismaTx = Boolean(tx && typeof tx.$queryRaw === "function");
    if (isPrismaTx) {
      try {
        const rows = await tx.$queryRaw<{ id: number }[]>`
          INSERT INTO domain_events (
            tenant_id,
            event_type,
            aggregate_type,
            aggregate_id,
            payload_json,
            metadata_json,
            status,
            attempt_count,
            occurred_at,
            created_at,
            updated_at
          )
          VALUES (
            ${tenantId},
            ${eventType},
            ${aggregateType},
            ${aggregateId},
            ${payloadJson},
            ${metadataJson},
            'pending',
            0,
            ${occurredAt},
            ${createdAt},
            ${createdAt}
          )
          RETURNING id
        `;
        const createdId = Number(rows?.[0]?.id || 0);
        if (createdId <= 0) {
          throw new Error("Failed to persist domain event in outbox");
        }
        return createdId;
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
        const isReturningUnsupported = message.includes("returning") || message.includes("syntax");
        if (isReturningUnsupported && typeof tx?.$executeRaw === "function" && typeof tx?.$queryRaw === "function") {
          await tx.$executeRaw`
            INSERT INTO domain_events (
              tenant_id,
              event_type,
              aggregate_type,
              aggregate_id,
              payload_json,
              metadata_json,
              status,
              attempt_count,
              occurred_at,
              created_at,
              updated_at
            )
            VALUES (
              ${tenantId},
              ${eventType},
              ${aggregateType},
              ${aggregateId},
              ${payloadJson},
              ${metadataJson},
              'pending',
              0,
              ${occurredAt},
              ${createdAt},
              ${createdAt}
            )
          `;
          try {
            const idRows = await tx.$queryRaw<{ id: number }[]>`
              SELECT last_insert_rowid() AS id
            `;
            const createdId = Number(idRows?.[0]?.id || 0);
            if (createdId > 0) {
              return createdId;
            }
          } catch (_fallbackError) {
            // Fall through to rethrow below.
          }
        }
        throw error;
      }
    }

    const executor = tx || { run };
    const insert = await executor.run(
      `
        INSERT INTO domain_events (
          tenant_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json,
          metadata_json,
          status,
          attempt_count,
          occurred_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
      `,
      [
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payloadJson,
        metadataJson,
        occurredAt,
        createdAt,
        createdAt,
      ],
    );

    const createdId = Number(insert?.lastID || 0);
    if (createdId <= 0) {
      throw new Error("Failed to persist domain event in outbox");
    }

    if (dispatchInline && !tx) {
      await dispatchPendingEvents({ limit: 1 });
    }

    return createdId;
  }

  async function dispatchPendingEvents({ limit = 100 }: { limit?: number } = {}): Promise<{ published: number; failed: number }> {
    const rows = await all(
      `
        SELECT
          id,
          tenant_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json,
          metadata_json,
          status,
          attempt_count,
          occurred_at,
          created_at
        FROM domain_events
        WHERE status IN ('pending', 'failed')
          AND COALESCE(attempt_count, 0) < ?
        ORDER BY id ASC
        LIMIT ?
      `,
      [Math.max(1, Number(maxAttempts || 10)), Math.max(1, Number(limit || 100))],
    );

    let published = 0;
    let failed = 0;

    for (const row of rows) {
      const eventId = Number(row.id || 0);
      if (!eventId) {
        continue;
      }

      await run(
        `
          UPDATE domain_events
          SET attempt_count = COALESCE(attempt_count, 0) + 1,
              updated_at = ?
          WHERE id = ?
        `,
        [new Date().toISOString(), eventId],
      );

      try {
        await dispatchEventToBroker(row);
        await run(
          `
            UPDATE domain_events
            SET status = 'published',
                published_at = ?,
                last_error = NULL,
                updated_at = ?
            WHERE id = ?
          `,
          [new Date().toISOString(), new Date().toISOString(), eventId],
        );
        published += 1;
      } catch (error) {
        const errorMessage = truncateError(error);
        await run(
          `
            UPDATE domain_events
            SET status = 'failed',
                last_error = ?,
                updated_at = ?
            WHERE id = ?
          `,
          [errorMessage, new Date().toISOString(), eventId],
        );
        failed += 1;
      }
    }

    return { published, failed };
  }

  async function dispatchEventToBroker(row: Record<string, any>): Promise<void> {
    if (provider === "none") {
      return;
    }

    const payload = {
      id: Number(row.id || 0),
      tenantId: String(row.tenant_id || defaultTenantId || "default"),
      eventType: String(row.event_type || ""),
      aggregateType: String(row.aggregate_type || ""),
      aggregateId: Number.isFinite(Number(row.aggregate_id)) ? Number(row.aggregate_id) : null,
      occurredAt: String(row.occurred_at || row.created_at || new Date().toISOString()),
      payload: safeJsonParse(row.payload_json),
      metadata: safeJsonParse(row.metadata_json),
      publishedAt: new Date().toISOString(),
    };

    if (provider === "rabbitmq") {
      if (!String(brokerUrl || "").trim()) {
        throw new Error("RabbitMQ broker URL is required");
      }
      await publishRabbitMq(payload);
      return;
    }

    if (provider === "kafka") {
      if (!String(brokerUrl || "").trim()) {
        throw new Error("Kafka broker URL is required");
      }
      await publishKafka(payload);
      return;
    }

    throw new Error(`Unsupported event broker provider: ${provider}`);
  }

  let rabbitMqConnection: any = null;
  let rabbitMqChannel: any = null;

  async function getRabbitMqChannel() {
    if (rabbitMqChannel) return rabbitMqChannel;
    const amqplibModuleName = "amqplib";
    const amqplibModule = await import(amqplibModuleName).catch(() => null) as any;
    if (!amqplibModule || typeof amqplibModule.connect !== "function") {
      throw new Error("RabbitMQ provider selected but dependency 'amqplib' is not installed");
    }

    rabbitMqConnection = await amqplibModule.connect(String(brokerUrl).trim());
    rabbitMqChannel = await rabbitMqConnection.createChannel();
    return rabbitMqChannel;
  }

  async function publishRabbitMq(payload: Record<string, unknown>): Promise<void> {
    const channel = await getRabbitMqChannel();
    const exchangeName = `${String(topicPrefix || "afriserve").trim() || "afriserve"}.domain.events`;
    const routingKey = String(payload.eventType || "domain.event").trim().toLowerCase();
    
    await channel.assertExchange(exchangeName, "topic", { durable: true });
    channel.publish(
      exchangeName,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: true,
        contentType: "application/json",
        messageId: String(payload.id || ""),
      },
    );
  }

  let kafkaProducer: any = null;

  async function getKafkaProducer() {
    if (kafkaProducer) return kafkaProducer;
    const kafkaModuleName = "kafkajs";
    const kafkaModule = await import(kafkaModuleName).catch(() => null) as any;
    if (!kafkaModule || typeof kafkaModule.Kafka !== "function") {
      throw new Error("Kafka provider selected but dependency 'kafkajs' is not installed");
    }

    const brokers = String(brokerUrl || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (brokers.length === 0) {
      throw new Error("At least one Kafka broker must be configured");
    }

    const kafka = new kafkaModule.Kafka({
      clientId: `${String(topicPrefix || "afriserve")}-domain-events`,
      brokers,
    });
    kafkaProducer = kafka.producer();
    await kafkaProducer.connect();
    return kafkaProducer;
  }

  async function publishKafka(payload: Record<string, unknown>): Promise<void> {
    const producer = await getKafkaProducer();
    await producer.send({
      topic: `${String(topicPrefix || "afriserve").trim() || "afriserve"}.domain.events`,
      messages: [
        {
          key: String(payload.aggregateId || payload.id || ""),
          value: JSON.stringify(payload),
        },
      ],
    });
  }

  function truncateError(error: unknown): string {
    const message = String(error instanceof Error ? error.message : error || "domain_event_dispatch_failed");
    return message.length > 1000 ? message.slice(0, 1000) : message;
  }

  function safeJsonParse(value: unknown): unknown {
    const raw = String(value || "").trim();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw);
    } catch (_error) {
      logger?.warn?.("events.outbox.payload_parse_failed", {
        provider,
      });
      return {};
    }
  }

  return {
    publishDomainEvent,
    dispatchPendingEvents,
  };
}

export {
  createDomainEventService,
};

