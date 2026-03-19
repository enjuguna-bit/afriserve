/**
 * Client Repository Interface (Port)
 * Defines contract for client persistence operations
 */

import { Client } from '../entities/Client';
import { ClientId } from '../value-objects/ClientId';

export interface IClientRepository {
  /**
   * Save a client aggregate (create or update)
   */
  save(client: Client): Promise<void>;

  /**
   * Find a client by ID
   */
  findById(id: ClientId): Promise<Client | null>;

  /**
   * Find a client by national ID
   */
  findByNationalId(nationalId: string): Promise<Client | null>;

  /**
   * Find a client by phone number
   */
  findByPhone(phone: string): Promise<Client | null>;

  /**
   * Check if a client exists
   */
  exists(id: ClientId): Promise<boolean>;

  /**
   * Find clients by branch
   */
  findByBranch(branchId: number, options?: {
    limit?: number;
    offset?: number;
  }): Promise<Client[]>;

  /**
   * Count clients by branch
   */
  countByBranch(branchId: number): Promise<number>;

  /**
   * Find all active clients
   */
  findActive(options?: {
    limit?: number;
    offset?: number;
  }): Promise<Client[]>;
}
