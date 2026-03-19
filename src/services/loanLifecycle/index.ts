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
  const d = deps as any;

  // Wire the execute helpers, binding deps so reviewHighRisk can dispatch them
  const executeHelpers = {
    executeWriteOffLoanFromApprovedRequest:    (a: Record<string, any>) => executeWriteOffLoanFromApprovedRequest(d, a as any),
    executeRestructureLoanFromApprovedRequest: (a: Record<string, any>) => executeRestructureLoanFromApprovedRequest(d, a as any),
    executeTopUpLoanFromApprovedRequest:       (a: Record<string, any>) => executeTopUpLoanFromApprovedRequest(d, a as any),
    executeRefinanceLoanFromApprovedRequest:   (a: Record<string, any>) => executeRefinanceLoanFromApprovedRequest(d, a as any),
    executeTermExtensionFromApprovedRequest:   (a: Record<string, any>) => executeTermExtensionFromApprovedRequest(d, a as any),
  };

  return {
    approveLoan:    (args: Parameters<typeof approveLoan>[1])    => approveLoan(d, args),
    rejectLoan:     (args: Parameters<typeof rejectLoan>[1])     => rejectLoan(d, args),
    disburseLoan:   (args: Parameters<typeof disburseLoan>[1])   => disburseLoan(d, args),
    writeOffLoan:   (args: Parameters<typeof writeOffLoan>[1])   => writeOffLoan(d, args),
    restructureLoan:(args: Parameters<typeof restructureLoan>[1])=> restructureLoan(d, args),
    topUpLoan:      (args: Parameters<typeof topUpLoan>[1])      => topUpLoan(d, args),
    refinanceLoan:  (args: Parameters<typeof refinanceLoan>[1])  => refinanceLoan(d, args),
    extendLoanTerm: (args: Parameters<typeof extendLoanTerm>[1]) => extendLoanTerm(d, args),
    reviewHighRiskApprovalRequest: (args: Parameters<typeof reviewHighRiskApprovalRequest>[2]) =>
      reviewHighRiskApprovalRequest(d, executeHelpers, args),
    getDisbursementTranches:  (args: Parameters<typeof getDisbursementTranches>[1])  => getDisbursementTranches(d, args),
    getLoanContractVersions:  (args: Parameters<typeof getLoanContractVersions>[1])  => getLoanContractVersions(d, args),
  };
}
