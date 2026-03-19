import type { RouteRegistrar } from "../types/routeDeps.js";
import { createLoanReadRepository } from "../repositories/loanReadRepository.js";
import { getLoanWorkflowSnapshot } from "./loanWorkflowSnapshotService.js";

type LoanStatementRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  hierarchyService: any;
  resolveJsonResponseFormat: (format: unknown, res: any) => string | null;
  isCollectibleLoanStatus: (status: unknown) => boolean;
  refreshOverdueInstallments: (loanId: number) => Promise<void>;
  getLoanBreakdown: (loanId: number) => Promise<Record<string, any> | null | undefined>;
  installmentStatusValues: string[];
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  loanUnderwritingService?: {
    refreshLoanAssessment: (loanId: number) => Promise<Record<string, unknown> | null | undefined>;
  } | null;
};

function registerLoanStatementRoutes(options: LoanStatementRouteOptions) {
  const {
    app,
    authenticate,
    parseId,
    hierarchyService,
    resolveJsonResponseFormat,
    isCollectibleLoanStatus,
    refreshOverdueInstallments,
    getLoanBreakdown,
    installmentStatusValues,
    get,
    all,
    loanUnderwritingService = null,
  } = options;
  const loanReadRepository = createLoanReadRepository({ all, get });

  app.get("/api/loans/:id/statement", authenticate, async (req, res, next) => {
    try {
      const format = resolveJsonResponseFormat(req.query.format, res);
      if (!format) {
        return;
      }

      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const loan = await loanReadRepository.getLoanStatementDetails(loanId);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id || loan.client_branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      if (isCollectibleLoanStatus(loan.status)) {
        await refreshOverdueInstallments(loanId);
      }

      const amortization = await loanReadRepository.listLoanAmortizationRows(loanId);

      const repayments = await loanReadRepository.listLoanRepaymentsDetailed(loanId);

      const scheduleSummary = await loanReadRepository.getLoanStatementInstallmentSummary(loanId);

      const repaymentSummary = await loanReadRepository.getLoanRepaymentSummary(loanId);

      const breakdown = await getLoanBreakdown(loanId);
      const workflow = await getLoanWorkflowSnapshot({ get, loanId });
      const underwriting = loanUnderwritingService
        ? await loanUnderwritingService.refreshLoanAssessment(loanId)
        : null;

      res.status(200).json({
        format,
        generated_at: new Date().toISOString(),
        loan,
        breakdown,
        workflow,
        underwriting,
        summary: {
          total_installments: Number(scheduleSummary?.total_installments || 0),
          paid_installments: Number(scheduleSummary?.paid_installments || 0),
          overdue_installments: Number(scheduleSummary?.overdue_installments || 0),
          total_due: Number(scheduleSummary?.total_due || 0),
          total_paid: Number(scheduleSummary?.total_paid || 0),
          total_outstanding: Number(scheduleSummary?.total_outstanding || 0),
          repayment_count: Number(repaymentSummary?.repayment_count || 0),
          total_repayments: Number(repaymentSummary?.total_repayments || 0),
          total_applied: Number(repaymentSummary?.total_applied || 0),
          first_repayment_at: repaymentSummary?.first_repayment_at || null,
          last_repayment_at: repaymentSummary?.last_repayment_at || null,
        },
        amortization,
        repayments,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/underwriting", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }

      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get("SELECT id, branch_id FROM loans WHERE id = ?", [loanId]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const underwriting = loanUnderwritingService
        ? await loanUnderwritingService.refreshLoanAssessment(loanId)
        : null;
      if (!underwriting) {
        res.status(404).json({ message: "Underwriting assessment not found" });
        return;
      }

      res.status(200).json(underwriting);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/repayments/:id/receipt", authenticate, async (req, res, next) => {
    try {
      const format = resolveJsonResponseFormat(req.query.format, res);
      if (!format) {
        return;
      }

      const repaymentId = parseId(req.params.id);
      if (!repaymentId) {
        res.status(400).json({ message: "Invalid repayment id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const repayment = await get(
        `
          SELECT
            r.id AS repayment_id,
            r.loan_id,
            r.amount,
            r.applied_amount,
            r.penalty_amount,
            r.interest_amount,
            r.principal_amount,
            r.overpayment_amount,
            r.paid_at,
            r.note,
            r.payment_channel,
            r.payment_provider,
            r.external_receipt,
            r.external_reference,
            r.payer_phone,
            r.recorded_by_user_id,
            ru.full_name AS recorded_by_name,
            l.client_id,
            l.branch_id,
            l.status AS loan_status,
            l.expected_total,
            l.repaid_total,
            l.balance,
            l.officer_id,
            c.full_name AS client_name,
            c.phone AS client_phone,
            b.name AS branch_name,
            b.code AS branch_code,
            o.full_name AS officer_name
          FROM repayments r
          INNER JOIN loans l ON l.id = r.loan_id
          INNER JOIN clients c ON c.id = l.client_id
          LEFT JOIN branches b ON b.id = l.branch_id
          LEFT JOIN users ru ON ru.id = r.recorded_by_user_id
          LEFT JOIN users o ON o.id = l.officer_id
          WHERE r.id = ?
        `,
        [repaymentId],
      );
      if (!repayment) {
        res.status(404).json({ message: "Repayment not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, repayment.branch_id)) {
        res.status(403).json({ message: "Forbidden: repayment is outside your scope" });
        return;
      }

      const repaymentProgress = await get(
        `
          SELECT
            COALESCE(SUM(COALESCE(applied_amount, amount)), 0) AS repaid_through_receipt
          FROM repayments
          WHERE loan_id = ?
            AND (
              datetime(paid_at) < datetime(?)
              OR (datetime(paid_at) = datetime(?) AND id <= ?)
            )
        `,
        [repayment.loan_id, repayment.paid_at, repayment.paid_at, repaymentId],
      );

      const expectedTotal = Number(repayment.expected_total || 0);
      const repaidThroughReceipt = Number(repaymentProgress?.repaid_through_receipt || 0);
      const outstandingAfterReceipt = Number(Math.max(0, expectedTotal - repaidThroughReceipt).toFixed(2));

      res.status(200).json({
        format,
        generated_at: new Date().toISOString(),
        receipt: {
          receipt_number: `RCP-${String(repayment.repayment_id).padStart(8, "0")}`,
          repayment_id: repayment.repayment_id,
          loan_id: repayment.loan_id,
          client_id: repayment.client_id,
          client_name: repayment.client_name,
          client_phone: repayment.client_phone,
          branch_id: repayment.branch_id,
          branch_name: repayment.branch_name,
          branch_code: repayment.branch_code,
          officer_id: repayment.officer_id,
          officer_name: repayment.officer_name,
          amount: Number(repayment.amount || 0),
          applied_amount: Number(repayment.applied_amount ?? repayment.amount ?? 0),
          penalty_amount: Number(repayment.penalty_amount || 0),
          interest_amount: Number(repayment.interest_amount || 0),
          principal_amount: Number(repayment.principal_amount || 0),
          overpayment_amount: Number(repayment.overpayment_amount || 0),
          paid_at: repayment.paid_at,
          note: repayment.note || null,
          payment_channel: repayment.payment_channel || "manual",
          payment_provider: repayment.payment_provider || null,
          external_receipt: repayment.external_receipt || null,
          external_reference: repayment.external_reference || null,
          payer_phone: repayment.payer_phone || null,
          recorded_by_user_id: repayment.recorded_by_user_id,
          recorded_by_name: repayment.recorded_by_name || null,
          loan_status: repayment.loan_status,
          expected_total: expectedTotal,
          repaid_through_receipt: Number(repaidThroughReceipt.toFixed(2)),
          outstanding_balance_after_receipt: outstandingAfterReceipt,
          current_loan_repaid_total: Number(repayment.repaid_total || 0),
          current_loan_balance: Number(repayment.balance || 0),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/repayments", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get("SELECT id, branch_id FROM loans WHERE id = ?", [loanId]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const repayments = await all(
        `
          SELECT
            id,
            loan_id,
            amount,
            applied_amount,
            penalty_amount,
            interest_amount,
            principal_amount,
            overpayment_amount,
            paid_at,
            note,
            payment_channel,
            payment_provider,
            external_receipt,
            external_reference,
            payer_phone,
            recorded_by_user_id
          FROM repayments
          WHERE loan_id = ?
          ORDER BY id DESC
        `,
        [loanId],
      );

      res.status(200).json(repayments);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/lifecycle-events", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }

      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get(
        `
          SELECT id, client_id, branch_id, status, created_at, approved_at, rejected_at, rejection_reason, disbursed_at, disbursement_note, archived_at
          FROM loans
          WHERE id = ?
        `,
        [loanId],
      );
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const [approvalRequests, tranches, contractVersions, repayments] = await Promise.all([
        all(
          `
            SELECT
              id,
              request_type,
              status,
              request_note,
              review_note,
              requested_at,
              reviewed_at,
              approved_at,
              rejected_at,
              executed_at
            FROM approval_requests
            WHERE loan_id = ?
            ORDER BY id ASC
          `,
          [loanId],
        ),
        all(
          `
            SELECT
              id,
              tranche_number,
              amount,
              disbursed_at,
              note,
              is_final
            FROM loan_disbursement_tranches
            WHERE loan_id = ?
            ORDER BY tranche_number ASC, id ASC
          `,
          [loanId],
        ),
        all(
          `
            SELECT
              id,
              version_number,
              event_type,
              note,
              created_at,
              expected_total,
              balance
            FROM loan_contract_versions
            WHERE loan_id = ?
            ORDER BY version_number ASC, id ASC
          `,
          [loanId],
        ),
        all(
          `
            SELECT
              id,
              amount,
              paid_at,
              note,
              payment_channel
            FROM repayments
            WHERE loan_id = ?
            ORDER BY id ASC
          `,
          [loanId],
        ),
      ]);

      const events: Array<Record<string, unknown>> = [];

      if (loan.created_at) {
        events.push({
          id: `loan-created-${loanId}`,
          at: loan.created_at,
          source_type: "loan",
          event_type: "loan_created",
          title: "Loan created",
          summary: "Application was created and entered the loan pipeline.",
          stage: "loan_application",
          metadata: {
            loanStatus: loan.status,
          },
        });
      }
      if (loan.approved_at) {
        events.push({
          id: `loan-approved-${loanId}`,
          at: loan.approved_at,
          source_type: "loan",
          event_type: "loan_approved",
          title: "Loan approved",
          summary: "Loan moved into approved state and is ready for funding.",
          stage: "approved_waiting_disbursement",
          metadata: {},
        });
      }
      if (loan.rejected_at) {
        events.push({
          id: `loan-rejected-${loanId}`,
          at: loan.rejected_at,
          source_type: "loan",
          event_type: "loan_rejected",
          title: "Loan rejected",
          summary: loan.rejection_reason || "Loan application was rejected.",
          stage: "rejected",
          metadata: {
            rejectionReason: loan.rejection_reason || null,
          },
        });
      }
      if (loan.disbursed_at) {
        events.push({
          id: `loan-disbursed-${loanId}`,
          at: loan.disbursed_at,
          source_type: "loan",
          event_type: "loan_disbursed",
          title: "Final disbursement completed",
          summary: loan.disbursement_note || "Loan reached active servicing state.",
          stage: "active",
          metadata: {
            note: loan.disbursement_note || null,
          },
        });
      }
      if (loan.archived_at) {
        events.push({
          id: `loan-archived-${loanId}`,
          at: loan.archived_at,
          source_type: "loan",
          event_type: "loan_archived",
          title: "Loan archived",
          summary: "Loan record was archived from the active book.",
          stage: "archived",
          metadata: {},
        });
      }

      for (const request of approvalRequests) {
        events.push({
          id: `approval-request-${request.id}`,
          at: request.executed_at || request.reviewed_at || request.requested_at,
          source_type: "approval_request",
          event_type: String(request.status || "pending") === "pending"
            ? "approval_requested"
            : `approval_${String(request.status || "").toLowerCase()}`,
          title: `Approval workflow: ${String(request.request_type || "request").replace(/^loan_/, "")}`,
          summary: request.review_note || request.request_note || `Status: ${String(request.status || "pending")}`,
          stage: String(request.status || "pending").toLowerCase(),
          metadata: {
            requestType: request.request_type,
            status: request.status,
            requestedAt: request.requested_at,
            reviewedAt: request.reviewed_at,
            approvedAt: request.approved_at,
            rejectedAt: request.rejected_at,
          },
        });
      }

      for (const tranche of tranches) {
        events.push({
          id: `tranche-${tranche.id}`,
          at: tranche.disbursed_at,
          source_type: "disbursement_tranche",
          event_type: Number(tranche.is_final || 0) === 1 ? "final_tranche_disbursed" : "tranche_disbursed",
          title: Number(tranche.is_final || 0) === 1 ? "Final tranche disbursed" : `Tranche ${Number(tranche.tranche_number || 0)} disbursed`,
          summary: tranche.note || `Amount ${Number(tranche.amount || 0).toFixed(2)}`,
          stage: Number(tranche.is_final || 0) === 1 ? "fully_disbursed" : "partially_disbursed",
          metadata: {
            trancheNumber: Number(tranche.tranche_number || 0),
            amount: Number(tranche.amount || 0),
            isFinal: Number(tranche.is_final || 0) === 1,
          },
        });
      }

      for (const version of contractVersions) {
        events.push({
          id: `contract-version-${version.id}`,
          at: version.created_at,
          source_type: "contract_version",
          event_type: String(version.event_type || "contract_update").toLowerCase(),
          title: `Contract version ${Number(version.version_number || 0)}`,
          summary: version.note || String(version.event_type || "Contract updated"),
          stage: String(version.event_type || "contract_update").toLowerCase(),
          metadata: {
            versionNumber: Number(version.version_number || 0),
            expectedTotal: Number(version.expected_total || 0),
            balance: Number(version.balance || 0),
          },
        });
      }

      for (const repayment of repayments) {
        events.push({
          id: `repayment-${repayment.id}`,
          at: repayment.paid_at,
          source_type: "repayment",
          event_type: "repayment_recorded",
          title: "Repayment recorded",
          summary: repayment.note || `Amount ${Number(repayment.amount || 0).toFixed(2)} via ${String(repayment.payment_channel || "manual")}`,
          stage: "repayment",
          metadata: {
            amount: Number(repayment.amount || 0),
            channel: repayment.payment_channel || "manual",
          },
        });
      }

      events.sort((left, right) => {
        const leftTime = new Date(String(left.at || "")).getTime();
        const rightTime = new Date(String(right.at || "")).getTime();
        return rightTime - leftTime;
      });

      res.status(200).json({
        loanId,
        currentStatus: String(loan.status || ""),
        total: events.length,
        events,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/breakdown", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get("SELECT id, branch_id FROM loans WHERE id = ?", [loanId]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const breakdown = await getLoanBreakdown(loanId);
      if (!breakdown) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }

      res.status(200).json(breakdown);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/installments", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }

      const status = String(req.query.status || "").trim().toLowerCase();
      if (status && !installmentStatusValues.includes(status)) {
        res.status(400).json({ message: "Invalid status filter. Use overdue, pending, or paid" });
        return;
      }

      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get("SELECT id, branch_id, status FROM loans WHERE id = ?", [loanId]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      if (isCollectibleLoanStatus(loan.status)) {
        await refreshOverdueInstallments(loanId);
      }

      const installments = await loanReadRepository.listLoanInstallments({
        loanId,
        status: status || undefined,
      });

      res.status(200).json(installments);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/schedule", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);

      const loan = await loanReadRepository.getLoanScheduleDetails(loanId);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      if (isCollectibleLoanStatus(loan.status)) {
        await refreshOverdueInstallments(loanId);
      }

      const installments = await loanReadRepository.listLoanAmortizationRows(loanId);

      const totals = await loanReadRepository.getLoanScheduleTotals(loanId);

      const breakdown = await getLoanBreakdown(loanId);
      const workflow = await getLoanWorkflowSnapshot({ get, loanId });

      res.status(200).json({
        loan,
        workflow,
        summary: totals,
        breakdown,
        installments,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/loans/:id/gl-journals", authenticate, async (req, res, next) => {
    try {
      const loanId = parseId(req.params.id);
      if (!loanId) {
        res.status(400).json({ message: "Invalid loan id" });
        return;
      }
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const loan = await get("SELECT id, branch_id FROM loans WHERE id = ?", [loanId]);
      if (!loan) {
        res.status(404).json({ message: "Loan not found" });
        return;
      }
      if (!hierarchyService.isBranchInScope(scope, loan.branch_id)) {
        res.status(403).json({ message: "Forbidden: loan is outside your scope" });
        return;
      }

      const journals = await all(
        `
          SELECT
            j.id,
            j.reference_type,
            j.reference_id,
            j.description,
            j.note,
            j.total_debit,
            j.total_credit,
            j.posted_at,
            j.posted_by_user_id,
            u.full_name AS posted_by_name
          FROM gl_journals j
          LEFT JOIN users u ON u.id = j.posted_by_user_id
          WHERE j.loan_id = ?
          ORDER BY j.id ASC
        `,
        [loanId],
      );

      const entries = await all(
        `
          SELECT
            e.id,
            e.journal_id,
            a.code AS account_code,
            a.name AS account_name,
            a.account_type,
            e.side,
            e.amount,
            e.memo
          FROM gl_entries e
          INNER JOIN gl_accounts a ON a.id = e.account_id
          INNER JOIN gl_journals j ON j.id = e.journal_id
          WHERE j.loan_id = ?
          ORDER BY e.id ASC
        `,
        [loanId],
      );

      const entriesByJournalId = new Map();
      for (const entry of entries) {
        const journalId = Number(entry.journal_id);
        if (!entriesByJournalId.has(journalId)) {
          entriesByJournalId.set(journalId, []);
        }
        entriesByJournalId.get(journalId).push({
          id: Number(entry.id),
          account_code: entry.account_code,
          account_name: entry.account_name,
          account_type: entry.account_type,
          side: entry.side,
          amount: Number(entry.amount || 0),
          memo: entry.memo || null,
        });
      }

      res.status(200).json({
        loan_id: loanId,
        journals: journals.map((journal) => ({
          id: Number(journal.id),
          reference_type: journal.reference_type,
          reference_id: journal.reference_id,
          description: journal.description,
          note: journal.note || null,
          total_debit: Number(journal.total_debit || 0),
          total_credit: Number(journal.total_credit || 0),
          posted_at: journal.posted_at,
          posted_by_user_id: journal.posted_by_user_id,
          posted_by_name: journal.posted_by_name || null,
          entries: entriesByJournalId.get(Number(journal.id)) || [],
        })),
      });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerLoanStatementRoutes,
};
