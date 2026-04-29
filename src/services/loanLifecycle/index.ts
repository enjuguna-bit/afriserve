/**
 * Loan Lifecycle Module — orchestrator
 *
 * Drop-in replacement for the monolithic createLoanLifecycleService factory.
 * All callers (serviceRegistry, bootstrap, loanExecutionRouteService) work
 * unchanged — same function name, same return shape.
 *
 * Structure:
 *   shared/helpers.ts        — pure utility functions
 *   shared/types.ts          — interface definitions
 *   shared/contextHelpers.ts — Prisma transaction helpers
 *   operations/approveLoan.ts
 *   operations/rejectLoan.ts
 *   operations/disburseLoan.ts
 *   operations/loanModifications.ts  (writeOff/restructure/topUp/refinance/extendTerm)
 *   operations/executeHelpers.ts     (execute*FromApprovedRequest — the tx executors)
 *   operations/reviewHighRisk.ts
 *   queries/loanQueries.ts
 */
import type { LoanLifecycleDeps } from "./shared/types.js";

import { approveLoan } from "./operations/approveLoan.js";
import { rejectLoan } from "./operations/rejectLoan.js";
import { disburseLoan } from "./operations/disburseLoan.js";
import {
  writeOffLoan,
  restructureLoan,
  topUpLoan,
  refinanceLoan,
  extendLoanTerm,
} from "./operations/loanModifications.js";
import {
  executeWriteOffLoanFromApprovedRequest,
  executeRestructureLoanFromApprovedRequest,
  executeTopUpLoanFromApprovedRequest,
  executeRefinanceLoanFromApprovedRequest,
  executeTermExtensionFromApprovedRequest,
} from "./operations/executeHelpers.js";
import { reviewHighRiskApprovalRequest } from "./operations/reviewHighRisk.js";
import { getDisbursementTranches, getLoanContractVersions } from "./queries/loanQueries.js";

export type { LoanLifecycleDeps };
export type { GeneralLedgerServiceLike, JournalLine } from "./shared/types.js";

export function createLoanLifecycleService(deps: LoanLifecycleDeps) {
  // Cast to any: each operation takes a Pick<LoanLifecycleDeps,...> subset.
  // Passing the full deps object is always safe — it is a structural superset.

  // Wire the execute helpers, binding deps so reviewHighRisk can dispatch them
  const executeHelpers = {
    executeWriteOffLoanFromApprovedRequest: (args: Parameters<typeof executeWriteOffLoanFromApprovedRequest>[1]) =>
      executeWriteOffLoanFromApprovedRequest(deps, args),
    executeRestructureLoanFromApprovedRequest: (args: Parameters<typeof executeRestructureLoanFromApprovedRequest>[1]) =>
      executeRestructureLoanFromApprovedRequest(deps, args),
    executeTopUpLoanFromApprovedRequest: (args: Parameters<typeof executeTopUpLoanFromApprovedRequest>[1]) =>
      executeTopUpLoanFromApprovedRequest(deps, args),
    executeRefinanceLoanFromApprovedRequest: (args: Parameters<typeof executeRefinanceLoanFromApprovedRequest>[1]) =>
      executeRefinanceLoanFromApprovedRequest(deps, args),
    executeTermExtensionFromApprovedRequest: (args: Parameters<typeof executeTermExtensionFromApprovedRequest>[1]) =>
      executeTermExtensionFromApprovedRequest(deps, args),
  };

  return {
    approveLoan:    (args: Parameters<typeof approveLoan>[1])    => approveLoan(deps, args),
    rejectLoan:     (args: Parameters<typeof rejectLoan>[1])     => rejectLoan(deps, args),
    disburseLoan:   (args: Parameters<typeof disburseLoan>[1])   => disburseLoan(deps, args),
    writeOffLoan:   (args: Parameters<typeof writeOffLoan>[1])   => writeOffLoan(deps, args),
    restructureLoan:(args: Parameters<typeof restructureLoan>[1])=> restructureLoan(deps, args),
    topUpLoan:      (args: Parameters<typeof topUpLoan>[1])      => topUpLoan(deps, args),
    refinanceLoan:  (args: Parameters<typeof refinanceLoan>[1])  => refinanceLoan(deps, args),
    extendLoanTerm: (args: Parameters<typeof extendLoanTerm>[1]) => extendLoanTerm(deps, args),
    reviewHighRiskApprovalRequest: (args: Parameters<typeof reviewHighRiskApprovalRequest>[2]) =>
      reviewHighRiskApprovalRequest(deps, executeHelpers as Parameters<typeof reviewHighRiskApprovalRequest>[1], args),
    getDisbursementTranches:  (args: Parameters<typeof getDisbursementTranches>[1])  => getDisbursementTranches(deps, args),
    getLoanContractVersions:  (args: Parameters<typeof getLoanContractVersions>[1])  => getLoanContractVersions(deps, args),
  };
}
