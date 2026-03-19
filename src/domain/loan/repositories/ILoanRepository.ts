import type { Loan } from "../entities/Loan.js";
import type { LoanId } from "../value-objects/LoanId.js";

/**
 * Port: persistence contract for the Loan aggregate.
 * Implementations live in the infrastructure layer.
 */
export interface ILoanRepository {
  /** Persist a new or updated loan aggregate. */
  save(loan: Loan): Promise<void>;

  /** Find by primary key. Returns null if not found. */
  findById(id: LoanId): Promise<Loan | null>;

  /** True if any loan row exists for this ID. */
  exists(id: LoanId): Promise<boolean>;

  /** All loans for a client, newest first. */
  findByClientId(clientId: number): Promise<Loan[]>;

  /** All loans in a branch, paginated. */
  findByBranchId(branchId: number, limit: number, offset: number): Promise<Loan[]>;

  /** Count active (disbursed) loans for a client — used for eligibility checks. */
  countActiveLoansByClientId(clientId: number): Promise<number>;
}
