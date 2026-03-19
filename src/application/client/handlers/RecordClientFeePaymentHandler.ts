import type { IClientRepository } from "../../../domain/client/repositories/IClientRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { RecordClientFeePaymentCommand } from "../commands/ClientCommands.js";
import { ClientId } from "../../../domain/client/value-objects/ClientId.js";
import { DomainValidationError } from "../../../domain/errors.js";

export interface RecordClientFeePaymentResult {
  clientId: number;
  feePaymentStatus: string;
}

/**
 * Command handler: RecordClientFeePayment
 *
 * Loads the Client aggregate, applies the fee payment via the domain method
 * (which emits ClientFeesPaid and transitions feePaymentStatus), persists,
 * and publishes events.
 */
export class RecordClientFeePaymentHandler {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: RecordClientFeePaymentCommand): Promise<RecordClientFeePaymentResult> {
    const client = await this.clientRepository.findById(
      ClientId.fromNumber(command.clientId),
    );
    if (!client) {
      throw new DomainValidationError(`Client ${command.clientId} not found`);
    }

    const paidAt = command.paidAt
      ? new Date(command.paidAt).toISOString()
      : new Date().toISOString();

    // Domain method: validates business rules, emits ClientFeesPaid
    client.recordFeePayment({
      amount: command.amount ?? null,
      paymentReference: command.paymentReference ?? null,
      paidAt,
      recordedByUserId: command.requestedByUserId,
    });

    await this.clientRepository.save(client);

    const events = client.getUncommittedEvents();
    client.clearEvents();
    await this.eventBus.publishAll(events);

    return {
      clientId: command.clientId,
      feePaymentStatus: client.feePaymentStatus.value,
    };
  }
}
