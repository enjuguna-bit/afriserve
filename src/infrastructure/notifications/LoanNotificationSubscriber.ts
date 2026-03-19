/**
 * LoanNotificationSubscriber
 *
 * Listens to loan domain events and sends borrower-facing SMS notifications
 * via INotificationService.
 *
 * Works with both the in-process IEventBus (OutboxEventBus / InMemoryEventBus)
 * AND the RabbitMqConsumer — both expose a compatible subscribe() method.
 *
 * Usage:
 *   // In-process (bootstrap.ts — always active when AT_API_KEY is set)
 *   const sub = new LoanNotificationSubscriber(smsService, get);
 *   sub.register(serviceRegistry.loan.eventBus);
 *
 *   // RabbitMQ consumer (bootstrap.ts — only when EVENT_BROKER_PROVIDER=rabbitmq)
 *   const sub2 = new LoanNotificationSubscriber(smsService, get);
 *   sub2.register(rabbitMqConsumer);
 */
import type { IEventBus } from "../events/IEventBus.js";
import type { INotificationService } from "./INotificationService.js";
import type { RabbitMqConsumer } from "../events/RabbitMqConsumer.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

/** Minimal subscribe surface shared by IEventBus and RabbitMqConsumer */
type SubscribableBus = Pick<IEventBus, "subscribe"> | Pick<RabbitMqConsumer, "subscribe">;

export class LoanNotificationSubscriber {
  constructor(
    private readonly notificationService: INotificationService,
    private readonly get: DbGet,
  ) {}

  register(bus: SubscribableBus): void {
    if (!this.notificationService.isEnabled()) return;

    bus.subscribe("loan.approved", async (event: any) => {
      await this._onLoanApproved(event).catch(() => {});
    });

    bus.subscribe("loan.disbursed", async (event: any) => {
      await this._onLoanDisbursed(event).catch(() => {});
    });

    bus.subscribe("loan.fully_repaid", async (event: any) => {
      await this._onLoanFullyRepaid(event).catch(() => {});
    });

    bus.subscribe("loan.rejected", async (event: any) => {
      await this._onLoanRejected(event).catch(() => {});
    });
  }

  // ── Event handlers ────────────────────────────────────────────────────

  private async _onLoanApproved(event: any): Promise<void> {
    const loanId = event?.aggregateId ?? event?.payload?.loanId;
    if (!loanId) return;
    const info = await this._getLoanClientPhone(Number(loanId));
    if (!info) return;

    await this.notificationService.notify({
      clientId:  info.clientId,
      loanId:    Number(loanId),
      phone:     info.phone,
      channel:   "sms",
      reference: `loan.approved.${loanId}`,
      message: `Dear ${info.fullName}, your loan application of KES ${info.principal} has been approved. Await disbursement.`,
    });
  }

  private async _onLoanDisbursed(event: any): Promise<void> {
    const loanId = event?.aggregateId ?? event?.payload?.loanId;
    if (!loanId) return;
    const info = await this._getLoanClientPhone(Number(loanId));
    if (!info) return;

    await this.notificationService.notify({
      clientId:  info.clientId,
      loanId:    Number(loanId),
      phone:     info.phone,
      channel:   "sms",
      reference: `loan.disbursed.${loanId}`,
      message: `Dear ${info.fullName}, KES ${info.principal} has been disbursed to your account. Loan ID: ${loanId}.`,
    });
  }

  private async _onLoanFullyRepaid(event: any): Promise<void> {
    const loanId = event?.aggregateId ?? event?.payload?.loanId;
    if (!loanId) return;
    const info = await this._getLoanClientPhone(Number(loanId));
    if (!info) return;

    await this.notificationService.notify({
      clientId:  info.clientId,
      loanId:    Number(loanId),
      phone:     info.phone,
      channel:   "sms",
      reference: `loan.fully_repaid.${loanId}`,
      message: `Dear ${info.fullName}, congratulations! Your loan (ID: ${loanId}) has been fully repaid. Thank you.`,
    });
  }

  private async _onLoanRejected(event: any): Promise<void> {
    const loanId = event?.aggregateId ?? event?.payload?.loanId;
    if (!loanId) return;
    const info = await this._getLoanClientPhone(Number(loanId));
    if (!info) return;

    await this.notificationService.notify({
      clientId:  info.clientId,
      loanId:    Number(loanId),
      phone:     info.phone,
      channel:   "sms",
      reference: `loan.rejected.${loanId}`,
      message: `Dear ${info.fullName}, your loan application (ID: ${loanId}) was not approved. Please contact your branch for details.`,
    });
  }

  // ── DB helpers ────────────────────────────────────────────────────────

  private async _getLoanClientPhone(loanId: number): Promise<{
    clientId: number;
    phone: string;
    fullName: string;
    principal: string;
  } | null> {
    const row = await this.get(
      `SELECT c.id AS client_id, c.phone, c.full_name,
              l.principal
       FROM loans l
       INNER JOIN clients c ON c.id = l.client_id
       WHERE l.id = ?
       LIMIT 1`,
      [loanId],
    );
    if (!row?.phone) return null;

    return {
      clientId:  Number(row.client_id),
      phone:     String(row.phone),
      fullName:  String(row.full_name ?? "Client"),
      principal: Number(row.principal ?? 0).toLocaleString("en-KE"),
    };
  }
}
