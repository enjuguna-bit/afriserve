import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AsyncState } from '../../../components/common/AsyncState'
import {
  activateGlCoaVersion,
  allocateGlSuspenseCase,
  createGlCoaVersion,
  createGlFxRate,
  createGlSuspenseCase,
  getGlAccountStatement,
  getGlTrialBalance,
  listGlAccounts,
  listGlBatchRuns,
  listGlCoaVersionAccounts,
  listGlCoaVersions,
  listGlFxRates,
  listGlPeriodLocks,
  listGlSuspenseCases,
  runGlBatch,
} from '../../../services/glService'
import { downloadReport } from '../../../services/reportService'
import { queryPolicies } from '../../../services/queryPolicies'
import { useToastStore } from '../../../store/toastStore'
import { downloadBlob } from '../../../utils/fileDownload'
import { feedback } from '../../../utils/feedback'
import type { GlAccountStatementPayload } from '../../../types/gl'
import styles from '../styles/Accounting.module.css'

const BatchPanel = lazy(() =>
  import('../components/AccountingOperationsPanels').then((m) => ({ default: m.BatchPanel })),
)
const FxPanel = lazy(() =>
  import('../components/AccountingOperationsPanels').then((m) => ({ default: m.FxPanel })),
)
const CoaPanel = lazy(() =>
  import('../components/AccountingOperationsPanels').then((m) => ({ default: m.CoaPanel })),
)
const SuspensePanel = lazy(() =>
  import('../components/AccountingOperationsPanels').then((m) => ({ default: m.SuspensePanel })),
)
const LedgerPanel = lazy(() =>
  import('../components/AccountingOperationsPanels').then((m) => ({ default: m.LedgerPanel })),
)

type TabKey = 'trial-balance' | 'batch' | 'fx' | 'coa' | 'suspense' | 'ledger'

const TABS: { key: TabKey; label: string; badge?: 'suspense' }[] = [
  { key: 'trial-balance', label: 'Trial balance' },
  { key: 'batch',         label: 'Batch close' },
  { key: 'fx',            label: 'FX rates' },
  { key: 'coa',           label: 'CoA versions' },
  { key: 'suspense',      label: 'Suspense', badge: 'suspense' },
  { key: 'ledger',        label: 'Ledger' },
]

type ExportFormat = 'csv' | 'pdf' | 'xlsx'

function fmt(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function AccountingDashboardPage() {
  const pushToast = useToastStore((s) => s.pushToast)

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('trial-balance')

  // ── Shared filters (trial balance + ledger) ────────────────────────────────
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [branchId, setBranchId] = useState('')
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)

  const filters = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    branchId: Number(branchId) > 0 ? Number(branchId) : undefined,
  }), [dateFrom, dateTo, branchId])

  // ── Batch state ────────────────────────────────────────────────────────────
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10))
  const [confirmingBatch, setConfirmingBatch] = useState<'eod' | 'eom' | 'eoy' | null>(null)
  const [pendingBatch, setPendingBatch] = useState<string | null>(null)

  // ── FX state ───────────────────────────────────────────────────────────────
  const [fxBase, setFxBase] = useState('USD')
  const [fxQuote, setFxQuote] = useState('KES')
  const [fxRate, setFxRate] = useState('')

  // ── CoA state ──────────────────────────────────────────────────────────────
  const [coaCode, setCoaCode] = useState('')
  const [coaName, setCoaName] = useState('')
  const [selectedCoaVersionId, setSelectedCoaVersionId] = useState<number | null>(null)

  // ── Suspense state ─────────────────────────────────────────────────────────
  const [suspenseAmount, setSuspenseAmount] = useState('')
  const [suspenseCurrency, setSuspenseCurrency] = useState('KES')
  const [suspenseAccountCode, setSuspenseAccountCode] = useState('LOAN_RECEIVABLE')

  // ── Ledger state ───────────────────────────────────────────────────────────
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────
  const accountsQuery = useQuery({
    queryKey: ['gl', 'accounts'],
    queryFn: listGlAccounts,
    ...queryPolicies.list,
  })
  const trialBalanceQuery = useQuery({
    queryKey: ['gl', 'trial-balance', filters],
    queryFn: () => getGlTrialBalance(filters),
    ...queryPolicies.report,
  })
  const fxRatesQuery = useQuery({
    queryKey: ['gl', 'fx-rates'],
    queryFn: () => listGlFxRates({ limit: 20 }),
    ...queryPolicies.list,
  })
  const batchesQuery = useQuery({
    queryKey: ['gl', 'batch-runs'],
    queryFn: () => listGlBatchRuns({ limit: 20 }),
    ...queryPolicies.list,
  })
  const periodLocksQuery = useQuery({
    queryKey: ['gl', 'period-locks'],
    queryFn: () => listGlPeriodLocks({ limit: 20 }),
    ...queryPolicies.list,
  })
  const coaQuery = useQuery({
    queryKey: ['gl', 'coa-versions'],
    queryFn: listGlCoaVersions,
    ...queryPolicies.list,
  })
  const coaAccountsQuery = useQuery({
    queryKey: ['gl', 'coa-version-accounts', selectedCoaVersionId],
    queryFn: () => listGlCoaVersionAccounts(Number(selectedCoaVersionId)),
    enabled: Number.isInteger(selectedCoaVersionId) && Number(selectedCoaVersionId) > 0,
    ...queryPolicies.detail,
  })
  const suspenseQuery = useQuery({
    queryKey: ['gl', 'suspense-cases'],
    queryFn: () => listGlSuspenseCases({ limit: 50 }),
    ...queryPolicies.list,
  })
  const accountStatementQuery = useQuery({
    queryKey: ['gl', 'account-statement', selectedAccountId, filters],
    queryFn: () => getGlAccountStatement(Number(selectedAccountId), filters),
    enabled: Number.isInteger(selectedAccountId) && Number(selectedAccountId) > 0,
    ...queryPolicies.detail,
  })

  // ── Auto-select defaults ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAccountId && accountsQuery.data && accountsQuery.data.length > 0) {
      setSelectedAccountId(accountsQuery.data[0].id)
      setSuspenseAccountCode(accountsQuery.data[0].code)
    }
  }, [selectedAccountId, accountsQuery.data])

  useEffect(() => {
    if (!selectedCoaVersionId && coaQuery.data && coaQuery.data.length > 0) {
      const active = coaQuery.data.find((v) => v.status === 'active')
      setSelectedCoaVersionId(active?.id ?? coaQuery.data[0].id)
    }
  }, [selectedCoaVersionId, coaQuery.data])

  // ── Derived counts for badges ──────────────────────────────────────────────
  const openSuspenseCount = (suspenseQuery.data || []).filter(
    (c) => c.status !== 'resolved',
  ).length

  // ── Actions ───────────────────────────────────────────────────────────────

  const exportTrialBalance = async (format: ExportFormat) => {
    try {
      setExportingFormat(format)
      const { blob, filename } = await downloadReport('/reports/gl/trial-balance', filters, format)
      downloadBlob(blob, filename || `gl-trial-balance.${format}`)
      pushToast({ type: 'success', message: feedback.system.exportReady('GL trial balance') })
    } catch {
      pushToast({ type: 'error', message: `Failed to export trial balance as ${format.toUpperCase()}.` })
    } finally {
      setExportingFormat(null)
    }
  }

  const runBatch = useCallback(async (batchType: 'eod' | 'eom' | 'eoy') => {
    setConfirmingBatch(null)
    setPendingBatch(batchType)
    try {
      await runGlBatch(batchType, { effectiveDate: batchDate })
      pushToast({
        type: 'success',
        message: `${batchType.toUpperCase()} batch for ${batchDate} completed successfully.`,
      })
      void batchesQuery.refetch()
      void periodLocksQuery.refetch()
      void trialBalanceQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: `Failed to run ${batchType.toUpperCase()} batch.` })
    } finally {
      setPendingBatch(null)
    }
  }, [batchDate, batchesQuery, periodLocksQuery, trialBalanceQuery, pushToast])

  const saveFxRate = useCallback(async () => {
    const parsed = Number(fxRate)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      pushToast({ type: 'error', message: 'Enter a valid positive FX rate.' })
      return
    }
    try {
      await createGlFxRate({
        baseCurrency: fxBase.toUpperCase(),
        quoteCurrency: fxQuote.toUpperCase(),
        rate: parsed,
      })
      setFxRate('')
      pushToast({ type: 'success', message: `${fxBase.toUpperCase()}/${fxQuote.toUpperCase()} rate saved.` })
      void fxRatesQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: 'Failed to save FX rate.' })
    }
  }, [fxBase, fxQuote, fxRate, fxRatesQuery, pushToast])

  const createCoa = useCallback(async () => {
    if (!coaCode.trim() || !coaName.trim()) {
      pushToast({ type: 'error', message: 'CoA code and name are required.' })
      return
    }
    try {
      await createGlCoaVersion({ versionCode: coaCode.trim().toUpperCase(), name: coaName.trim() })
      setCoaCode('')
      setCoaName('')
      pushToast({ type: 'success', message: `CoA version ${coaCode.toUpperCase()} created.` })
      const refreshed = await coaQuery.refetch()
      const created = refreshed.data?.find((v) => v.version_code === coaCode.trim().toUpperCase())
      if (created) setSelectedCoaVersionId(created.id)
    } catch {
      pushToast({ type: 'error', message: 'Failed to create CoA version.' })
    }
  }, [coaCode, coaName, coaQuery, pushToast])

  const activateVersion = useCallback(async (versionId: number) => {
    try {
      await activateGlCoaVersion(versionId)
      pushToast({ type: 'success', message: 'CoA version activated.' })
      void coaQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: 'Failed to activate CoA version.' })
    }
  }, [coaQuery, pushToast])

  const createSuspense = useCallback(async () => {
    const amount = Number(suspenseAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast({ type: 'error', message: 'Enter a valid suspense amount.' })
      return
    }
    try {
      await createGlSuspenseCase({
        transactionAmount: amount,
        transactionCurrency: suspenseCurrency.toUpperCase(),
        bookCurrency: 'KES',
      })
      setSuspenseAmount('')
      pushToast({ type: 'success', message: `Suspense case created for ${suspenseCurrency} ${amount.toFixed(2)}.` })
      void suspenseQuery.refetch()
      void trialBalanceQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: 'Failed to create suspense case.' })
    }
  }, [suspenseAmount, suspenseCurrency, suspenseQuery, trialBalanceQuery, pushToast])

  const allocateSuspense = useCallback(async (caseId: number, amount: number) => {
    try {
      await allocateGlSuspenseCase(caseId, {
        targetAccountCode: suspenseAccountCode,
        allocateTransactionAmount: amount,
      })
      pushToast({ type: 'success', message: `Suspense case #${caseId} fully allocated.` })
      void suspenseQuery.refetch()
      void trialBalanceQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: `Failed to allocate suspense case #${caseId}.` })
    }
  }, [suspenseAccountCode, suspenseQuery, trialBalanceQuery, pushToast])

  // ── Derived data ───────────────────────────────────────────────────────────
  const tb = trialBalanceQuery.data
  const totalDebits = tb?.totals.debits ?? 0
  const totalCredits = tb?.totals.credits ?? 0

  const loading = accountsQuery.isLoading || trialBalanceQuery.isLoading
  const error = accountsQuery.isError || trialBalanceQuery.isError

  return (
    <div className={styles.page}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Finance · GL</p>
          <h1 className={styles.pageTitle}>General ledger & accounting</h1>
          <p className={styles.pageSubtitle}>
            Multi-currency FX, EOD/EOM/EOY batch close, suspense reconciliation, CoA versioning,
            and account-level journal entries.
          </p>
        </div>
      </div>

      <AsyncState
        loading={loading}
        error={error}
        empty={false}
        loadingText="Loading accounting data…"
        errorText="Unable to load accounting data."
        onRetry={() => void Promise.all([accountsQuery.refetch(), trialBalanceQuery.refetch()])}
      />

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className={styles.tabBar} role="tablist">
        {TABS.map((tab) => {
          const badgeCount = tab.badge === 'suspense' ? openSuspenseCount : 0
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {badgeCount > 0 && (
                <span className={styles.tabBadge}>{badgeCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <div className={styles.tabContent} role="tabpanel">

        {/* TRIAL BALANCE */}
        {activeTab === 'trial-balance' && (
          <>
            {/* Filters + export */}
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Date from</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Date to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Branch ID</span>
                <input
                  type="number"
                  min={1}
                  value={branchId}
                  placeholder="All branches"
                  style={{ width: 120 }}
                  onChange={(e) => setBranchId(e.target.value)}
                />
              </label>
              <div className={styles.fieldActions}>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={exportingFormat !== null}
                  onClick={() => void exportTrialBalance('csv')}
                >
                  {exportingFormat === 'csv' ? 'Exporting…' : 'Export CSV'}
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={exportingFormat !== null}
                  onClick={() => void exportTrialBalance('xlsx')}
                >
                  {exportingFormat === 'xlsx' ? 'Exporting…' : 'Export XLSX'}
                </button>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={exportingFormat !== null}
                  onClick={() => void exportTrialBalance('pdf')}
                >
                  {exportingFormat === 'pdf' ? 'Exporting…' : 'Export PDF'}
                </button>
              </div>
            </div>

            {/* KPI strip */}
            {tb && !trialBalanceQuery.isLoading && (
              <div className={styles.kpiStrip}>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Total debits</div>
                  <div className={styles.kpiValue}>{fmt(totalDebits)}</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Total credits</div>
                  <div className={styles.kpiValue}>{fmt(totalCredits)}</div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Difference</div>
                  <div className={`${styles.kpiValue} ${tb.balanced ? styles.balanced : styles.unbalanced}`}>
                    {fmt(Math.abs(totalDebits - totalCredits))}
                  </div>
                  <div className={`${styles.kpiBalanced} ${tb.balanced ? styles.balanced : styles.unbalanced}`}>
                    {tb.balanced ? '✓ Balanced' : '⚠ Out of balance'}
                  </div>
                </div>
                <div className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>Accounts</div>
                  <div className={styles.kpiValue}>{tb.rows.length}</div>
                </div>
              </div>
            )}

            {/* Trial balance table */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Trial balance</h2>
              {trialBalanceQuery.isLoading ? (
                <div className={styles.stateBox}><div className={styles.spinner} /></div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Account name</th>
                        <th>Type</th>
                        <th className={styles.tdRight}>Debits</th>
                        <th className={styles.tdRight}>Credits</th>
                        <th className={styles.tdRight}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tb?.rows || []).map((row) => (
                        <tr
                          key={row.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            const acc = accountsQuery.data?.find((a) => a.code === row.code)
                            if (acc) { setSelectedAccountId(acc.id); setActiveTab('ledger') }
                          }}
                        >
                          <td><span className={styles.mono}>{row.code}</span></td>
                          <td>{row.name}</td>
                          <td>{row.account_type}</td>
                          <td className={`${styles.tdRight} ${styles.mono}`}>{fmt(row.debits)}</td>
                          <td className={`${styles.tdRight} ${styles.mono}`}>{fmt(row.credits)}</td>
                          <td className={`${styles.tdRight} ${styles.mono}`}>{fmt(row.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {tb && (
                      <tfoot>
                        <tr className={styles.totalsRow}>
                          <td colSpan={3}><strong>Totals</strong></td>
                          <td className={`${styles.tdRight} ${styles.mono}`}><strong>{fmt(totalDebits)}</strong></td>
                          <td className={`${styles.tdRight} ${styles.mono}`}><strong>{fmt(totalCredits)}</strong></td>
                          <td className={`${styles.tdRight} ${styles.mono}`}><strong>{fmt(totalDebits - totalCredits)}</strong></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* BATCH CLOSE */}
        {activeTab === 'batch' && (
          <Suspense fallback={<div className={styles.stateBox}><div className={styles.spinner} /></div>}>
            <BatchPanel
              batchDate={batchDate}
              onBatchDateChange={setBatchDate}
              onRunBatch={runBatch}
              batches={batchesQuery.data || []}
              periodLocks={periodLocksQuery.data || []}
              pendingBatch={pendingBatch}
              confirmingBatch={confirmingBatch}
              onConfirmBatch={setConfirmingBatch}
              onCancelConfirm={() => setConfirmingBatch(null)}
            />
          </Suspense>
        )}

        {/* FX RATES */}
        {activeTab === 'fx' && (
          <Suspense fallback={<div className={styles.stateBox}><div className={styles.spinner} /></div>}>
            <FxPanel
              fxBase={fxBase}
              fxQuote={fxQuote}
              fxRate={fxRate}
              onFxBaseChange={setFxBase}
              onFxQuoteChange={setFxQuote}
              onFxRateChange={setFxRate}
              onSaveFxRate={saveFxRate}
              fxRates={fxRatesQuery.data || []}
            />
          </Suspense>
        )}

        {/* COA VERSIONS */}
        {activeTab === 'coa' && (
          <Suspense fallback={<div className={styles.stateBox}><div className={styles.spinner} /></div>}>
            <CoaPanel
              coaCode={coaCode}
              coaName={coaName}
              onCoaCodeChange={setCoaCode}
              onCoaNameChange={setCoaName}
              onCreateCoa={createCoa}
              coaVersions={coaQuery.data || []}
              selectedCoaVersionId={selectedCoaVersionId}
              onSelectCoaVersion={setSelectedCoaVersionId}
              onActivateVersion={activateVersion}
              coaAccounts={coaAccountsQuery.data || []}
            />
          </Suspense>
        )}

        {/* SUSPENSE */}
        {activeTab === 'suspense' && (
          <Suspense fallback={<div className={styles.stateBox}><div className={styles.spinner} /></div>}>
            <SuspensePanel
              suspenseAmount={suspenseAmount}
              suspenseCurrency={suspenseCurrency}
              suspenseAccountCode={suspenseAccountCode}
              onSuspenseAmountChange={setSuspenseAmount}
              onSuspenseCurrencyChange={setSuspenseCurrency}
              onSuspenseAccountCodeChange={setSuspenseAccountCode}
              onCreateSuspense={createSuspense}
              suspenseCases={suspenseQuery.data || []}
              onAllocateSuspense={allocateSuspense}
              accounts={accountsQuery.data || []}
            />
          </Suspense>
        )}

        {/* LEDGER */}
        {activeTab === 'ledger' && (
          <Suspense fallback={<div className={styles.stateBox}><div className={styles.spinner} /></div>}>
            <LedgerPanel
              accounts={accountsQuery.data || []}
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              statement={(accountStatementQuery.data ?? null) as GlAccountStatementPayload | null}
              statementLoading={accountStatementQuery.isLoading}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
