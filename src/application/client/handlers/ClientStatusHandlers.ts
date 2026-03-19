import type { IClientRepository } from "../../../domain/client/repositories/IClientRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { DeactivateClientCommand, ReactivateClientCommand } from "../commands/ClientCommands.js";
import { ClientId } from "../../../domain/client/value-objects/ClientId.js";
import { DomainValidationError, DomainConflictError } from "../../../domain/errors.js";

export interface ClientStatusResult {
  clientId: number;
  isActive: boolean;
}

/**
 * Command handler: DeactivateClient
 *
 * Loads the Client aggregate, calls deactivate(), persists, publishes events.
 * The domain method is a no-op if already inactive.
 */
export class DeactivateClientHandler {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: DeactivateClientCommand): Promise<ClientStatusResult> {
    const client = await this.clientRepository.findById(
      ClientId.fromNumber(command.clientId),
    );
    if (!client) {
      throw new DomainValidationError(`Client ${command.clientId} not found`);
    }

    // Guard: cannot deactivate a client who has active loans
    // (this check is a domain invariant — the aggregate enforces it)
    if (!client.isActive) {
      throw new DomainConflictError(`Client ${command.clientId} is already inactive`);
    }

    client.deactivate(new Date());
    await this.clientRepository.save(client);

    const events = client.getUncommittedEvents();
    client.clearEvents();
    await this.eventBus.publishAll(events);

    return { clientId: command.clientId, isActive: false };
  }
}

/**
 * Command handler: ReactivateClient
 *
 * Loads the Client aggregate, calls reactivate(), persists, publishes events.
 */
export class ReactivateClientHandler {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: ReactivateClientCommand): Promise<ClientStatusResult> {
    const client = await this.clientRepository.findById(
      ClientId.fromNumber(command.clientId),
    );
    if (!client) {
      throw new DomainValidationError(`Client ${command.clientId} not found`);
    }

    if (client.isActive) {
      throw new DomainConflictError(`Client ${command.clientId} is already active`);
    }

    client.reactivate();
    await this.clientRepository.save(client);

    const events = client.getUncommittedEvents();
    client.clearEvents();
    await this.eventBus.publishAll(events);

    return { clientId: command.clientId, isActive: true };
  }
}
