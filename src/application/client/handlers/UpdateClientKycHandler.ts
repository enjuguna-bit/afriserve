import type { IClientRepository } from "../../../domain/client/repositories/IClientRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { UpdateClientKycCommand } from "../commands/ClientCommands.js";
import { ClientId } from "../../../domain/client/value-objects/ClientId.js";
import { KycStatus } from "../../../domain/client/value-objects/KycStatus.js";
import { DomainValidationError } from "../../../domain/errors.js";

export interface UpdateClientKycResult {
  clientId: number;
  previousStatus: string;
  newStatus: string;
}

/**
 * Command handler: UpdateClientKyc
 *
 * Loads the Client aggregate, applies the KYC status transition via the
 * domain method (which validates the transition and emits ClientKycUpdated),
 * persists, and publishes events.
 *
 * Does NOT call syncClientOnboardingStatus — that side-effect belongs to the
 * route layer or an event listener, keeping this handler pure.
 */
export class UpdateClientKycHandler {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: UpdateClientKycCommand): Promise<UpdateClientKycResult> {
    const client = await this.clientRepository.findById(
      ClientId.fromNumber(command.clientId),
    );
    if (!client) {
      throw new DomainValidationError(`Client ${command.clientId} not found`);
    }

    const previousStatus = client.kycStatus.value;

    // KycStatus.fromString validates the value — throws on unrecognised status
    const nextKycStatus = KycStatus.fromString(command.status);

    // No-op guard (idempotent)
    if (previousStatus === nextKycStatus.value) {
      return { clientId: command.clientId, previousStatus, newStatus: nextKycStatus.value };
    }

    // Domain method: validates transition, emits ClientKycUpdated event
    client.updateKycStatus(nextKycStatus, command.requestedByUserId, command.note ?? null);

    await this.clientRepository.save(client);

    const events = client.getUncommittedEvents();
    client.clearEvents();
    await this.eventBus.publishAll(events);

    return { clientId: command.clientId, previousStatus, newStatus: nextKycStatus.value };
  }
}
