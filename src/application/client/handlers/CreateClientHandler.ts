import type { IClientRepository } from "../../../domain/client/repositories/IClientRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { CreateClientCommand } from "../commands/ClientCommands.js";
import { Client } from "../../../domain/client/entities/Client.js";
import { PhoneNumber } from "../../../domain/client/value-objects/PhoneNumber.js";
import { NationalId } from "../../../domain/client/value-objects/NationalId.js";

export interface CreateClientResult {
  clientId: number;
}

/**
 * Command handler: CreateClient
 *
 * Responsibility:
 *   1. Validate phone/nationalId via value objects — rejects malformed input
 *      before any DB write.
 *   2. Build the Client aggregate (id=0, will be overwritten after persist).
 *   3. Delegate to IClientRepository.create(), which wraps the atomic
 *      dedup-check + INSERT and returns the DB-assigned id.
 *   4. Publish domain events (ClientCreated).
 *
 * Branch resolution, officer validation, and scope checks are performed by
 * the calling route handler before invoking this command. This handler owns
 * only domain invariants.
 */
export class CreateClientHandler {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: CreateClientCommand): Promise<CreateClientResult> {
    // 1. Validate value objects (throws DomainValidationError on bad format)
    const phone = command.phone
      ? PhoneNumber.fromString(command.phone)
      : null;
    const nationalId = command.nationalId
      ? NationalId.fromString(command.nationalId)
      : null;

    // 2. Build transient aggregate (id=0 — replaced after persist)
    const client = Client.create({
      id: 0,
      fullName: command.fullName,
      phone,
      nationalId,
      branchId: command.branchId ?? 0,
      officerId: command.officerId ?? null,
      createdByUserId: command.requestedByUserId,
      kraPin:             command.kraPin             ?? null,
      photoUrl:           command.photoUrl           ?? null,
      idDocumentUrl:      command.idDocumentUrl      ?? null,
      nextOfKinName:      command.nextOfKinName      ?? null,
      nextOfKinPhone:     command.nextOfKinPhone     ?? null,
      nextOfKinRelation:  command.nextOfKinRelation  ?? null,
      businessType:       command.businessType       ?? null,
      businessYears:      command.businessYears      ?? null,
      businessLocation:   command.businessLocation   ?? null,
      residentialAddress: command.residentialAddress ?? null,
    });

    // Capture events before the aggregate is modified by create()
    const events = client.getUncommittedEvents();
    client.clearEvents();

    // 3. Persist — repository handles dedup check + INSERT atomically,
    //    returns the DB-assigned id
    const clientId = await this.clientRepository.create(client);

    // 4. Publish domain events
    await this.eventBus.publishAll(events);

    return { clientId };
  }
}
