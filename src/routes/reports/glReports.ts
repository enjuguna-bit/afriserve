import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";
import type { RouteRegistrar } from "../../types/routeDeps.js";

type ReportRow = Record<string, any>;

function registerGlReports(app: RouteRegistrar, context: Record<string, any>) {
  const {
    get,
    all,
    authenticate,
    authorize,
    parseId,
    writeAuditLog,
    hierarchyService,
    fxRateService,
    suspenseAccountingService,
    coaVersioningService,
    accountingBatchService,
    resolveFormat,
    parseDateParam,
    applyScopeAndBranchFilter,
    sendTabularExport,
  } = context;

  const reportRoles = ["admin", "ceo", "finance", "investor", "partner", "operations_manager", "area_manager"];
  const financeWriteRoles = ["admin", "ceo", "finance", "operations_manager"];

  function parsePositiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  app.get(
    "/api/reports/gl/fx/rates",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const baseCurrency = String(req.query.baseCurrency || req.query.base || "").trim().toUpperCase() || undefined;
        const quoteCurrency = String(req.query.quoteCurrency || req.query.quote || "").trim().toUpperCase() || undefined;
        const limit = Number(req.query.limit || 100);
        const rows = await fxRateService.listRates({
          baseCurrency,
          quoteCurrency,
          limit,
        });

        res.status(200).json(rows.map((row: ReportRow) => ({
          id: Number(row.id),
          base_currency: String(row.base_currency || ""),
          quote_currency: String(row.quote_currency || ""),
          rate: Number(row.rate || 0),
          source: String(row.source || ""),
          quoted_at: row.quoted_at,
          created_by_user_id: Number(row.created_by_user_id || 0) || null,
          created_at: row.created_at,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/reports/gl/fx/rates",
    authenticate,
    authorize(...financeWriteRoles),
    async (req, res, next) => {
      try {
        const baseCurrency = String(req.body?.baseCurrency || req.body?.base || "").trim().toUpperCase();
        const quoteCurrency = String(req.body?.quoteCurrency || req.body?.quote || "").trim().toUpperCase();
        const rate = parsePositiveNumber(req.body?.rate);
        const quotedAt = req.body?.quotedAt || null;

        if (!baseCurrency || !quoteCurrency || !rate) {
          res.status(400).json({ message: "baseCurrency, quoteCurrency, and positive rate are required." });
          return;
        }

        const inserted = await fxRateService.upsertRate({
          baseCurrency,
          quoteCurrency,
          rate,
          source: "manual",
          quotedAt,
          createdByUserId: Number(req.user?.sub || 0) || null,
        });

        if (typeof writeAuditLog === "function") {
          await writeAuditLog({
            userId: req.user?.sub || null,
            action: "gl_fx_rate_manual_upsert",
            targetType: "gl_fx_rate",
            targetId: null,
            details: JSON.stringify(inserted),
            ipAddress: req.ip,
          });
        }

        res.status(201).json(inserted);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/batches",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const batchType = String(req.query.batchType || "").trim().toLowerCase() || undefined;
        const limit = Math.min(Math.max(1, Number(req.query.limit || 30)), 500);
        const rows = await accountingBatchService.listBatchRuns({
          batchType,
          limit,
        });

        res.status(200).json(rows.map((row: ReportRow) => ({
          id: Number(row.id || 0),
          batch_type: String(row.batch_type || ""),
          effective_date: typeof row.effective_date === "string" ? row.effective_date.slice(0, 10) : (row.effective_date ? new Date(row.effective_date as any).toISOString().slice(0, 10) : null),
          status: String(row.status || ""),
          started_at: row.started_at,
          completed_at: row.completed_at || null,
          triggered_by_user_id: Number(row.triggered_by_user_id || 0) || null,
          summary: (() => {
            try {
              return row.summary_json ? JSON.parse(String(row.summary_json)) : null;
            } catch {
              return null;
            }
          })(),
          error_message: row.error_message || null,
          created_at: row.created_at,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/period-locks",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const lockType = String(req.query.lockType || "").trim().toLowerCase() || undefined;
        const limit = Math.min(Math.max(1, Number(req.query.limit || 30)), 500);
        const rows = await accountingBatchService.listPeriodLocks({
          lockType,
          limit,
        });

        res.status(200).json(rows.map((row: ReportRow) => ({
          id: Number(row.id || 0),
          batch_run_id: Number(row.batch_run_id || 0) || null,
          lock_type: String(row.lock_type || ""),
          lock_date: typeof row.lock_date === "string" ? row.lock_date.slice(0, 10) : (row.lock_date ? new Date(row.lock_date as any).toISOString().slice(0, 10) : null),
          status: String(row.status || ""),
          note: row.note || null,
          locked_by_user_id: Number(row.locked_by_user_id || 0) || null,
          locked_at: row.locked_at,
          created_at: row.created_at,
          batch_status: row.batch_status ? String(row.batch_status) : null,
          batch_completed_at: row.batch_completed_at || null,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  for (const batchType of ["eod", "eom", "eoy"]) {
    app.post(
      `/api/reports/gl/batch/${batchType}`,
      authenticate,
      authorize(...financeWriteRoles),
      async (req, res, next) => {
        try {
          const effectiveDate = req.body?.effectiveDate || null;
          const note = String(req.body?.note || "").trim() || null;
          const response = await accountingBatchService.runBatch({
            batchType: batchType as "eod" | "eom" | "eoy",
            effectiveDate,
            note,
            triggeredByUserId: Number(req.user?.sub || 0) || null,
          });

          if (typeof writeAuditLog === "function") {
            await writeAuditLog({
              userId: req.user?.sub || null,
              action: `gl_batch_${batchType}_run`,
              targetType: "gl_batch_runs",
              targetId: response.id || null,
              details: JSON.stringify(response.summary || {}),
              ipAddress: req.ip,
            });
          }

          res.status(200).json(response);
        } catch (error) {
          next(error);
        }
      },
    );
  }

  app.get(
    "/api/reports/gl/coa/versions",
    authenticate,
    authorize(...reportRoles),
    async (_req, res, next) => {
      try {
        const versions = await coaVersioningService.listVersions();
        res.status(200).json(versions.map((version: ReportRow) => ({
          id: Number(version.id),
          version_code: String(version.version_code || ""),
          name: String(version.name || ""),
          status: String(version.status || ""),
          effective_from: version.effective_from || null,
          effective_to: version.effective_to || null,
          parent_version_id: Number(version.parent_version_id || 0) || null,
          notes: version.notes || null,
          created_by_user_id: Number(version.created_by_user_id || 0) || null,
          activated_by_user_id: Number(version.activated_by_user_id || 0) || null,
          activated_at: version.activated_at || null,
          account_count: Number(version.account_count || 0),
          created_at: version.created_at,
          updated_at: version.updated_at,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/reports/gl/coa/versions",
    authenticate,
    authorize(...financeWriteRoles),
    async (req, res, next) => {
      try {
        const versionCode = String(req.body?.versionCode || "").trim();
        const name = String(req.body?.name || "").trim();
        if (!versionCode || !name) {
          res.status(400).json({ message: "versionCode and name are required." });
          return;
        }

        const created = await coaVersioningService.createVersion({
          versionCode,
          name,
          notes: req.body?.notes || null,
          parentVersionId: parseId(req.body?.parentVersionId),
          cloneFromVersionId: parseId(req.body?.cloneFromVersionId),
          createdByUserId: Number(req.user?.sub || 0) || null,
          effectiveFrom: req.body?.effectiveFrom || null,
        });

        if (typeof writeAuditLog === "function") {
          await writeAuditLog({
            userId: req.user?.sub || null,
            action: "gl_coa_version_created",
            targetType: "gl_coa_versions",
            targetId: Number(created?.id || 0) || null,
            details: JSON.stringify(created || {}),
            ipAddress: req.ip,
          });
        }

        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/reports/gl/coa/versions/:id/activate",
    authenticate,
    authorize(...financeWriteRoles),
    async (req, res, next) => {
      try {
        const versionId = parseId(req.params.id);
        if (!versionId) {
          res.status(400).json({ message: "Invalid CoA version id." });
          return;
        }

        const activated = await coaVersioningService.activateVersion({
          versionId,
          activatedByUserId: Number(req.user?.sub || 0) || null,
          effectiveFrom: req.body?.effectiveFrom || null,
        });

        if (typeof writeAuditLog === "function") {
          await writeAuditLog({
            userId: req.user?.sub || null,
            action: "gl_coa_version_activated",
            targetType: "gl_coa_versions",
            targetId: versionId,
            details: JSON.stringify(activated || {}),
            ipAddress: req.ip,
          });
        }

        res.status(200).json(activated);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/coa/versions/:id/accounts",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const versionId = parseId(req.params.id);
        if (!versionId) {
          res.status(400).json({ message: "Invalid CoA version id." });
          return;
        }
        const rows = await coaVersioningService.listVersionAccounts(versionId);
        res.status(200).json(rows.map((row: ReportRow) => ({
          id: Number(row.id),
          coa_version_id: Number(row.coa_version_id),
          base_account_id: Number(row.base_account_id || 0) || null,
          code: String(row.code || ""),
          name: String(row.name || ""),
          account_type: String(row.account_type || ""),
          is_contra: Number(row.is_contra || 0),
          is_posting_allowed: Number(row.is_posting_allowed || 0),
          is_active: Number(row.is_active || 0),
          created_at: row.created_at,
          updated_at: row.updated_at,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/suspense/cases",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const status = String(req.query.status || "").trim().toLowerCase() || undefined;
        const branchId = parseId(req.query.branchId);
        const limit = Math.min(Math.max(1, Number(req.query.limit || 50)), 500);
        const offset = Math.max(0, Number(req.query.offset || 0));

        const rows = await suspenseAccountingService.listCases({
          status,
          branchId,
          limit,
          offset,
        });
        res.status(200).json(rows.map((row: ReportRow) => ({
          id: Number(row.id),
          external_reference: row.external_reference || null,
          source_channel: row.source_channel || null,
          status: String(row.status || ""),
          description: row.description || null,
          branch_id: Number(row.branch_id || 0) || null,
          client_id: Number(row.client_id || 0) || null,
          loan_id: Number(row.loan_id || 0) || null,
          transaction_currency: String(row.transaction_currency || "KES"),
          transaction_amount: Number(row.transaction_amount || 0),
          transaction_amount_remaining: Number(row.transaction_amount_remaining || 0),
          book_currency: String(row.book_currency || "KES"),
          book_amount: Number(row.book_amount || 0),
          book_amount_remaining: Number(row.book_amount_remaining || 0),
          opening_fx_rate: Number(row.opening_fx_rate || 1),
          allocated_transaction_amount: Number(row.allocated_transaction_amount || 0),
          allocated_book_amount: Number(row.allocated_book_amount || 0),
          allocated_fx_difference: Number(row.allocated_fx_difference || 0),
          received_at: row.received_at,
          created_by_user_id: Number(row.created_by_user_id || 0) || null,
          resolved_by_user_id: Number(row.resolved_by_user_id || 0) || null,
          resolved_at: row.resolved_at || null,
          note: row.note || null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/reports/gl/suspense/cases",
    authenticate,
    authorize(...financeWriteRoles),
    async (req, res, next) => {
      try {
        const transactionAmount = parsePositiveNumber(req.body?.transactionAmount);
        if (!transactionAmount) {
          res.status(400).json({ message: "transactionAmount must be a positive number." });
          return;
        }

        const created = await suspenseAccountingService.createCase({
          externalReference: req.body?.externalReference || null,
          sourceChannel: req.body?.sourceChannel || null,
          description: req.body?.description || null,
          branchId: parseId(req.body?.branchId),
          clientId: parseId(req.body?.clientId),
          loanId: parseId(req.body?.loanId),
          transactionCurrency: req.body?.transactionCurrency || "KES",
          transactionAmount,
          bookCurrency: req.body?.bookCurrency || "KES",
          fxRate: parsePositiveNumber(req.body?.fxRate),
          receivedAt: req.body?.receivedAt || null,
          note: req.body?.note || null,
          createdByUserId: Number(req.user?.sub || 0) || null,
        });

        if (typeof writeAuditLog === "function") {
          await writeAuditLog({
            userId: req.user?.sub || null,
            action: "gl_suspense_case_created",
            targetType: "gl_suspense_cases",
            targetId: Number(created?.suspense_case?.id || 0) || null,
            details: JSON.stringify(created || {}),
            ipAddress: req.ip,
          });
        }

        res.status(201).json(created);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/reports/gl/suspense/cases/:id/allocate",
    authenticate,
    authorize(...financeWriteRoles),
    async (req, res, next) => {
      try {
        const caseId = parseId(req.params.id);
        const targetAccountCode = String(req.body?.targetAccountCode || "").trim().toUpperCase();
        const allocateTransactionAmount = parsePositiveNumber(req.body?.allocateTransactionAmount);

        if (!caseId || !targetAccountCode || !allocateTransactionAmount) {
          res.status(400).json({
            message: "Valid case id, targetAccountCode, and allocateTransactionAmount are required.",
          });
          return;
        }

        const allocation = await suspenseAccountingService.allocateCase({
          caseId,
          targetAccountCode,
          allocateTransactionAmount,
          fxRate: parsePositiveNumber(req.body?.fxRate),
          note: req.body?.note || null,
          allocatedByUserId: Number(req.user?.sub || 0) || null,
        });

        if (typeof writeAuditLog === "function") {
          await writeAuditLog({
            userId: req.user?.sub || null,
            action: "gl_suspense_case_allocated",
            targetType: "gl_suspense_cases",
            targetId: caseId,
            details: JSON.stringify(allocation || {}),
            ipAddress: req.ip,
          });
        }

        res.status(200).json(allocation);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/accounts",
    authenticate,
    authorize(...reportRoles),
    async (_req, res, next) => {
      try {
        const accounts = await all(
          `
            SELECT
              id,
              code,
              name,
              account_type,
              is_contra,
              is_active,
              created_at
            FROM gl_accounts
            ORDER BY code ASC
          `,
        );

        res.status(200).json(accounts.map((row: Record<string, any>) => ({
          id: Number(row.id),
          code: String(row.code || ""),
          name: String(row.name || ""),
          account_type: String(row.account_type || ""),
          is_contra: Number(row.is_contra || 0),
          is_active: Number(row.is_active || 0),
          created_at: row.created_at,
        })));
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/trial-balance",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();
        const rows = await all(
          `
            SELECT
              a.id,
              a.code,
              a.name,
              a.account_type,
              ROUND(COALESCE(SUM(CASE WHEN e.side = 'debit' THEN e.amount ELSE 0 END), 0), 2) AS debits,
              ROUND(COALESCE(SUM(CASE WHEN e.side = 'credit' THEN e.amount ELSE 0 END), 0), 2) AS credits
            FROM gl_accounts a
            LEFT JOIN gl_entries e ON e.account_id = a.id
            LEFT JOIN gl_journals j ON j.id = e.journal_id
            ${whereSql}
            GROUP BY a.id, a.code, a.name, a.account_type
            ORDER BY a.code ASC
          `,
          queryParams,
        );

        const totals = rows.reduce(
          (acc: { debits: number; credits: number }, row: Record<string, any>) => ({
            debits: Number((acc.debits + Number(row.debits || 0)).toFixed(2)),
            credits: Number((acc.credits + Number(row.credits || 0)).toFixed(2)),
          }),
          { debits: 0, credits: 0 },
        );

        const responseRows = rows.map((row: Record<string, any>) => ({
          id: Number(row.id),
          code: String(row.code || ""),
          name: String(row.name || ""),
          account_type: String(row.account_type || ""),
          debits: Number(row.debits || 0),
          credits: Number(row.credits || 0),
          net: Number((Number(row.debits || 0) - Number(row.credits || 0)).toFixed(2)),
        }));

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: "gl-trial-balance",
            title: "GL Trial Balance",
            headers: ["id", "code", "name", "account_type", "debits", "credits", "net"],
            rows: responseRows,
          });
          return;
        }

        res.status(200).json({
          period: {
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            branchId: branchFilter || null,
          },
          totals,
          balanced: Math.abs(Number(totals.debits || 0) - Number(totals.credits || 0)) <= 0.005,
          rows: responseRows,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/accounts/:id/statement",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const accountId = parseId(req.params.id);
        if (!accountId) {
          res.status(400).json({ message: "Invalid account id" });
          return;
        }

        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const account = await get(
          `
            SELECT id, code, name, account_type, is_contra, is_active
            FROM gl_accounts
            WHERE id = ?
          `,
          [accountId],
        );
        if (!account) {
          res.status(404).json({ message: "GL account not found" });
          return;
        }

        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addEquals("e.account_id", accountId);
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();
        const entries = await all(
          `
            SELECT
              e.id,
              e.journal_id,
              j.posted_at,
              date(datetime(j.posted_at, '+3 hours')) AS business_date,
              j.reference_type,
              j.reference_id,
              j.loan_id,
              j.client_id,
              j.branch_id,
              b.name AS branch_name,
              e.side,
              ROUND(CASE WHEN e.side = 'debit' THEN e.amount ELSE 0 END, 2) AS debit_amount,
              ROUND(CASE WHEN e.side = 'credit' THEN e.amount ELSE 0 END, 2) AS credit_amount,
              e.amount,
              e.transaction_amount,
              e.transaction_currency,
              e.memo,
              j.base_currency,
              j.transaction_currency AS journal_transaction_currency,
              j.exchange_rate,
              j.description,
              j.note
            FROM gl_entries e
            INNER JOIN gl_journals j ON j.id = e.journal_id
            LEFT JOIN branches b ON b.id = j.branch_id
            ${whereSql}
            ORDER BY datetime(j.posted_at) ASC, e.id ASC
          `,
          queryParams,
        );

        const accountType = String(account.account_type || "").toLowerCase();
        const isContra = Number(account.is_contra || 0) === 1;
        const debitNormalTypes = ["asset", "expense"];
        const debitIsPositive = debitNormalTypes.includes(accountType) ? !isContra : isContra;

        let runningBalance = 0;
        const ledgerEntries = entries.map((entry: Record<string, any>) => {
          const debitAmount = Number(entry.debit_amount || 0);
          const creditAmount = Number(entry.credit_amount || 0);
          const entryEffect = debitIsPositive
            ? Number((debitAmount - creditAmount).toFixed(2))
            : Number((creditAmount - debitAmount).toFixed(2));
          runningBalance = Number((runningBalance + entryEffect).toFixed(2));

          return {
            id: Number(entry.id),
            journal_id: Number(entry.journal_id),
            posted_at: entry.posted_at,
            reference_type: entry.reference_type,
            reference_id: entry.reference_id,
            loan_id: entry.loan_id,
            client_id: entry.client_id,
            branch_id: entry.branch_id,
            branch_name: entry.branch_name,
            side: entry.side,
            debit_amount: debitAmount,
            credit_amount: creditAmount,
            amount: Number(entry.amount || 0),
            transaction_amount: Number(entry.transaction_amount || 0),
            transaction_currency: entry.transaction_currency || null,
            base_currency: entry.base_currency || "KES",
            journal_transaction_currency: entry.journal_transaction_currency || entry.transaction_currency || null,
            exchange_rate: Number(entry.exchange_rate || 1),
            entry_effect: entryEffect,
            running_balance: runningBalance,
            business_date: entry.business_date || null,
            memo: entry.memo,
            description: entry.description,
            note: entry.note,
          };
        });

        const groupedMap = new Map<string, {
          business_date: string | null;
          reference_type: string | null;
          branch_names: Set<string>;
          journal_ids: Set<number>;
          entry_count: number;
          total_debits: number;
          total_credits: number;
          net_effect: number;
          closing_balance: number;
        }>();

        for (const entry of ledgerEntries) {
          const businessDate = entry.business_date || null;
          const referenceType = entry.reference_type || null;
          const key = `${businessDate || "unknown"}::${referenceType || "unclassified"}`;
          const existing = groupedMap.get(key);

          if (existing) {
            existing.entry_count += 1;
            existing.total_debits = Number((existing.total_debits + Number(entry.debit_amount || 0)).toFixed(2));
            existing.total_credits = Number((existing.total_credits + Number(entry.credit_amount || 0)).toFixed(2));
            existing.net_effect = Number((existing.net_effect + Number(entry.entry_effect || 0)).toFixed(2));
            existing.closing_balance = Number(entry.running_balance || 0);
            if (entry.branch_name) {
              existing.branch_names.add(String(entry.branch_name));
            }
            existing.journal_ids.add(Number(entry.journal_id));
            continue;
          }

          groupedMap.set(key, {
            business_date: businessDate,
            reference_type: referenceType,
            branch_names: entry.branch_name ? new Set([String(entry.branch_name)]) : new Set<string>(),
            journal_ids: new Set([Number(entry.journal_id)]),
            entry_count: 1,
            total_debits: Number(entry.debit_amount || 0),
            total_credits: Number(entry.credit_amount || 0),
            net_effect: Number(entry.entry_effect || 0),
            closing_balance: Number(entry.running_balance || 0),
          });
        }

        const dailyGroups = Array.from(groupedMap.values()).map((group) => {
          const branchNames = Array.from(group.branch_names);
          return {
            business_date: group.business_date,
            reference_type: group.reference_type,
            branch_label: branchNames.length === 0
              ? null
              : branchNames.length === 1
                ? branchNames[0]
                : `${branchNames.length} branches`,
            branch_count: branchNames.length,
            journal_count: group.journal_ids.size,
            entry_count: group.entry_count,
            total_debits: Number(group.total_debits.toFixed(2)),
            total_credits: Number(group.total_credits.toFixed(2)),
            net_effect: Number(group.net_effect.toFixed(2)),
            closing_balance: Number(group.closing_balance.toFixed(2)),
          };
        });

        const totals = ledgerEntries.reduce(
          (acc: { total_debits: number; total_credits: number }, entry: Record<string, any>) => ({
            total_debits: Number((acc.total_debits + Number(entry.debit_amount || 0)).toFixed(2)),
            total_credits: Number((acc.total_credits + Number(entry.credit_amount || 0)).toFixed(2)),
          }),
          { total_debits: 0, total_credits: 0 },
        );

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: `gl-account-${Number(account.id)}-statement`,
            title: `GL Account Statement ${String(account.code || "")}`,
            headers: [
              "id",
              "journal_id",
              "posted_at",
              "reference_type",
              "reference_id",
              "loan_id",
              "client_id",
              "branch_id",
              "branch_name",
              "side",
              "debit_amount",
              "credit_amount",
              "amount",
              "entry_effect",
              "running_balance",
              "memo",
              "description",
              "note",
            ],
            rows: ledgerEntries,
          });
          return;
        }

        res.status(200).json({
          period: {
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            branchId: branchFilter || null,
          },
          account: {
            id: Number(account.id),
            code: String(account.code || ""),
            name: String(account.name || ""),
            account_type: String(account.account_type || ""),
            is_contra: Number(account.is_contra || 0),
            is_active: Number(account.is_active || 0),
          },
          summary: {
            ...totals,
            closing_balance: runningBalance,
            entry_count: ledgerEntries.length,
            group_count: dailyGroups.length,
          },
          daily_groups: dailyGroups,
          entries: ledgerEntries,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/income-statement",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();

        const accountBalances = await get(
          `
            SELECT
              ROUND(COALESCE(SUM(CASE
                WHEN a.code = 'INTEREST_INCOME' AND e.side = 'credit' THEN e.amount
                WHEN a.code = 'INTEREST_INCOME' AND e.side = 'debit' THEN -e.amount
                ELSE 0 END), 0), 2) AS interest_income,
              ROUND(COALESCE(SUM(CASE
                WHEN a.code = 'FEE_INCOME' AND e.side = 'credit' THEN e.amount
                WHEN a.code = 'FEE_INCOME' AND e.side = 'debit' THEN -e.amount
                ELSE 0 END), 0), 2) AS fee_income,
              ROUND(COALESCE(SUM(CASE
                WHEN a.code = 'WRITE_OFF_EXPENSE' AND e.side = 'debit' THEN e.amount
                WHEN a.code = 'WRITE_OFF_EXPENSE' AND e.side = 'credit' THEN -e.amount
                ELSE 0 END), 0), 2) AS write_off_expense
            FROM gl_entries e
            INNER JOIN gl_accounts a ON a.id = e.account_id
            INNER JOIN gl_journals j ON j.id = e.journal_id
            ${whereSql}
          `,
          queryParams,
        );

        const interestIncome = Number(accountBalances?.interest_income || 0);
        const feeIncome = Number(accountBalances?.fee_income || 0);
        const writeOffExpense = Number(accountBalances?.write_off_expense || 0);

        const summary = {
          interest_income: interestIncome,
          fee_income: feeIncome,
          write_off_expense: writeOffExpense,
          net_interest_after_write_off: Number((interestIncome - writeOffExpense).toFixed(2)),
          net_operating_income: Number((interestIncome + feeIncome - writeOffExpense).toFixed(2)),
        };

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: "gl-income-statement",
            title: "GL Income Statement",
            headers: ["interest_income", "fee_income", "write_off_expense", "net_interest_after_write_off", "net_operating_income"],
            rows: [summary],
          });
          return;
        }

        res.status(200).json({
          period: {
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            branchId: branchFilter || null,
          },
          summary,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/api/reports/gl/cash-flow",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
          return;
        }

        const branchFilter = parseId(req.query.branchId);
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("j.posted_at", dateFrom, dateTo);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "j.branch_id",
          branchFilter,
          tenantColumnRef: "j.tenant_id",
          res,
        })) {
          return;
        }
        // Narrow to CASH-account entries only — added after scope so tenant + branch are anchored.
        whereBuilder.addClause("a.code = 'CASH'");

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();

        const rows = await all(
          `
            SELECT
              date(datetime(j.posted_at, '+3 hours')) AS flow_date,
              ROUND(COALESCE(SUM(CASE
                WHEN j.reference_type = 'loan_disbursement' AND e.side = 'credit' THEN e.amount
                ELSE 0 END), 0), 2) AS disbursements,
              ROUND(COALESCE(SUM(CASE
                WHEN j.reference_type = 'loan_repayment' AND e.side = 'debit' THEN e.amount
                ELSE 0 END), 0), 2) AS repayments
            FROM gl_entries e
            INNER JOIN gl_journals j ON j.id = e.journal_id
            INNER JOIN gl_accounts a ON a.id = e.account_id
            ${whereSql}
            GROUP BY date(datetime(j.posted_at, '+3 hours'))
            ORDER BY flow_date ASC
          `,
          queryParams,
        );

        const daily = rows.map((row: Record<string, any>) => {
          const disbursements = Number(row.disbursements || 0);
          const repayments = Number(row.repayments || 0);
          return {
            date: row.flow_date,
            disbursements,
            repayments,
            net_cash_flow: Number((repayments - disbursements).toFixed(2)),
          };
        });

        const totals = daily.reduce(
          (acc: { disbursements: number; repayments: number }, row: Record<string, any>) => ({
            disbursements: Number((acc.disbursements + Number(row.disbursements || 0)).toFixed(2)),
            repayments: Number((acc.repayments + Number(row.repayments || 0)).toFixed(2)),
          }),
          { disbursements: 0, repayments: 0 },
        );

        const response = {
          period: {
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            branchId: branchFilter || null,
          },
          totals: {
            disbursements: totals.disbursements,
            repayments: totals.repayments,
            net_cash_flow: Number((totals.repayments - totals.disbursements).toFixed(2)),
          },
          daily,
        };

        if (format !== "json") {
          sendTabularExport(res, {
            format,
            filenameBase: "gl-cash-flow",
            title: "GL Cash Flow",
            headers: ["date", "disbursements", "repayments", "net_cash_flow"],
            rows: response.daily,
          });
          return;
        }

        res.status(200).json(response);
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerGlReports,
};
