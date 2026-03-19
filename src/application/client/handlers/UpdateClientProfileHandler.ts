import type { IClientRepository } from "../../../domain/client/repositories/IClientRepository.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { UpdateClientProfileCommand } from "../commands/ClientCommands.js";
import { ClientId } from "../../../domain/client/value-objects/ClientId.js";
import { PhoneNumber } from "../../../domain/client/value-objects/PhoneNumber.js";
import { NationalId } from "../../../domain/client/value-objects/NationalId.js";
import { DomainValidationError } from "../../../domain/errors.js";

export interface UpdateClientProfileResult {
  clientId: number;
}

/**
 * Command handler: UpdateClientProfile
 *
 * Loads the Client aggregate, applies the profile mutation via the domain
 * method (which stamps updatedAt and records which fields changed), persists,
 * and publishes any domain events.
 *
 * Value objects are validated here so malformed phone/nationalId are rejected
 * before any DB write.
 *
 * Note: branchId is a structural/administrative field managed by the route
 * layer directly (requires hierarchy checks). It is not in updateProfile().
 */
export class UpdateClientProfileHandler {
  constructor(
    private readonly clientRepository: IClientRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async handle(command: UpdateClientProfileCommand): Promise<UpdateClientProfileResult> {
    const client = await this.clientRepository.findById(
      ClientId.fromNumber(command.clientId),
    );
    if (!client) {
      throw new DomainValidationError(`Client ${command.clientId} not found`);
    }

    // Validate value objects for fields being updated
    const phone = command.phone !== undefined
      ? (command.phone ? PhoneNumber.fromString(command.phone) : null)
      : undefined;
    const nationalId = command.nationalId !== undefined
      ? (command.nationalId ? NationalId.fromString(command.nationalId) : null)
      : undefined;

    // Domain method: applies only supplied fields, stamps updatedAt
    // branchId is not included — it requires hierarchy validation at route level
    client.updateProfile({
      fullName:           command.fullName           ?? undefined,
      phone,
      nationalId,
      kraPin:             command.kraPin             ?? undefined,
      photoUrl:           command.photoUrl           ?? undefined,
      idDocumentUrl:      command.idDocumentUrl      ?? undefined,
      nextOfKinName:      command.nextOfKinName      ?? undefined,
      nextOfKinPhone:     command.nextOfKinPhone     ?? undefined,
      nextOfKinRelation:  command.nextOfKinRelation  ?? undefined,
      businessType:       command.businessType       ?? undefined,
      businessYears:      command.businessYears      ?? undefined,
      businessLocation:   command.businessLocation   ?? undefined,
      residentialAddress: command.residentialAddress ?? undefined,
      officerId:          command.officerId          ?? undefined,
    });

    await this.clientRepository.save(client);

    const events = client.getUncommittedEvents();
    client.clearEvents();
    await this.eventBus.publishAll(events);

    return { clientId: command.clientId };
  }
}
