import type { Client } from "../entities/Client.js";
import type { ClientId } from "../value-objects/ClientId.js";

/**
 * Port: persistence contract for the Client aggregate.
 * Implementations live in the infrastructure layer (e.g., SqliteClientRepository).
 */
export interface IClientRepository {
  /**
   * INSERT a new client row atomically (dedup check + insert in one transaction).
   * Returns the DB-assigned numeric id.
   * Throws a DomainConflictError if a client with the same national_id already exists.
   */
  create(client: Client): Promise<number>;

  /** INSERT or UPDATE depending on whether the row already exists. */
  save(client: Client): Promise<void>;

  /** Find by primary key. Returns null if not found. */
  findById(id: ClientId): Promise<Client | null>;

  /** Find by normalized national ID (case-insensitive). */
  findByNationalId(nationalId: string): Promise<Client | null>;

  /** Find by phone number (digit-normalized match). */
  findByPhone(phone: string): Promise<Client | null>;

  /** True if any client row with this ID exists. */
  exists(id: ClientId): Promise<boolean>;

  /** Paginated list scoped to a branch. */
  findByBranch(branchId: number, limit: number, offset: number): Promise<Client[]>;

  /** Count clients in a branch. */
  countByBranch(branchId: number): Promise<number>;
}
