import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
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
import { queryPolicies } from '../../../services/queryPolicies'
import { downloadReport } from '../../../services/reportService'
import { useToastStore } from '../../../store/toastStore'
import { downloadBlob } from '../../../utils/fileDownload'
import styles from '../../shared/styles/EntityPage.module.css'

const AccountingOperationsPanels = lazy(() => import('../components/AccountingOperationsPanels').then((module) => ({ default: module.AccountingOperationsPanels })))

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

type ExportFormat = 'csv' | 'pdf' | 'xlsx'

export function AccountingDashboardPage() {
  const pushToast = useToastStore((state) => state.pushToast)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null)
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10))

  const [fxBase, setFxBase] = useState('USD')
  const [fxQuote, setFxQuote] = useState('KES')
  const [fxRate, setFxRate] = useState('')

  const [coaCode, setCoaCode] = useState('')
  const [coaName, setCoaName] = useState('')
  const [selectedCoaVersionId, setSelectedCoaVersionId] = useState<number | null>(null)

  const [suspenseAmount, setSuspenseAmount] = useState('')
  const [suspenseCurrency, setSuspenseCurrency] = useState('KES')
  const [suspenseAccountCode, setSuspenseAccountCode] = useState('LOAN_RECEIVABLE')

  const filters = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    branchId: Number(branchId) > 0 ? Number(branchId) : undefined,
  }), [dateFrom, dateTo, branchId])

  const accountsQuery = useQuery({
    queryKey: ['gl', 'accounts'],
    queryFn: listGlAccounts,
    ...queryPolicies.list,
  })
  const trialBalanceQuery = useQuery({
    queryKey: ['gl', 'trial-balance', filters.dateFrom || null, filters.dateTo || null, filters.branchId || null],
    queryFn: () => getGlTrialBalance(filters),
    ...queryPolicies.report,
  })
  const accountStatementQuery = useQuery({
    queryKey: ['gl', 'account-statement', selectedAccountId, filters.dateFrom || null, filters.dateTo || null, filters.branchId || null],
    queryFn: () => getGlAccountStatement(Number(selectedAccountId), filters),
    enabled: Number.isInteger(selectedAccountId) && Number(selectedAccountId) > 0,
    ...queryPolicies.detail,
  })
  const fxRatesQuery = useQuery({
    queryKey: ['gl', 'fx-rates'],
    queryFn: () => listGlFxRates({ limit: 10 }),
    ...queryPolicies.list,
  })
  const batchesQuery = useQuery({
    queryKey: ['gl', 'batch-runs'],
    queryFn: () => listGlBatchRuns({ limit: 10 }),
    ...queryPolicies.list,
  })
  const periodLocksQuery = useQuery({
    queryKey: ['gl', 'period-locks'],
    queryFn: () => listGlPeriodLocks({ limit: 10 }),
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
    queryFn: () => listGlSuspenseCases({ status: 'open', limit: 20 }),
    ...queryPolicies.list,
  })

  useEffect(() => {
    if (!selectedAccountId && accountsQuery.data && accountsQuery.data.length > 0) {
      setSelectedAccountId(accountsQuery.data[0].id)
      setSuspenseAccountCode(accountsQuery.data[0].code)
    }
  }, [selectedAccountId, accountsQuery.data])

  useEffect(() => {
    if (!selectedCoaVersionId && coaQuery.data && coaQuery.data.length > 0) {
      const activeVersion = coaQuery.data.find((version) => version.status === 'active')
      setSelectedCoaVersionId(activeVersion?.id || coaQuery.data[0].id)
    }
  }, [selectedCoaVersionId, coaQuery.data])

  const exportTrialBalance = async (format: ExportFormat) => {
    try {
      setExportingFormat(format)
      const { blob, filename } = await downloadReport('/reports/gl/trial-balance', filters, format)
      downloadBlob(blob, filename || `gl-trial-balance.${format}`)
      pushToast({ type: 'success', message: `GL trial balance exported (${format.toUpperCase()}).` })
    } catch {
      pushToast({ type: 'error', message: `Failed to export GL trial balance as ${format.toUpperCase()}.` })
    } finally {
      setExportingFormat(null)
    }
  }

  const runBatchAndRefresh = async (batchType: 'eod' | 'eom' | 'eoy') => {
    try {
      await runGlBatch(batchType, { effectiveDate: batchDate })
      pushToast({ type: 'success', message: `${batchType.toUpperCase()} batch completed.` })
      void batchesQuery.refetch()
      void periodLocksQuery.refetch()
      void trialBalanceQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: `Failed to run ${batchType.toUpperCase()}.` })
    }
  }

  const saveFxRate = async () => {
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
      pushToast({ type: 'success', message: 'FX rate saved.' })
      void fxRatesQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: 'Failed to save FX rate.' })
    }
  }

  const createCoa = async () => {
    if (!coaCode.trim() || !coaName.trim()) {
      pushToast({ type: 'error', message: 'CoA code and name are required.' })
      return
    }
    try {
      await createGlCoaVersion({ versionCode: coaCode.trim().toUpperCase(), name: coaName.trim() })
      setCoaCode('')
      setCoaName('')
      pushToast({ type: 'success', message: 'CoA version created.' })
      const refreshed = await coaQuery.refetch()
      const createdVersion = refreshed.data?.find((version) => version.version_code === coaCode.trim().toUpperCase())
      if (createdVersion) {
        setSelectedCoaVersionId(createdVersion.id)
      }
    } catch {
      pushToast({ type: 'error', message: 'Failed to create CoA version.' })
    }
  }

  const createSuspense = async () => {
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
      pushToast({ type: 'success', message: 'Suspense case created.' })
      void suspenseQuery.refetch()
      void trialBalanceQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: 'Failed to create suspense case.' })
    }
  }

  const allocateSuspense = async (caseId: number, amount: number) => {
    try {
      await allocateGlSuspenseCase(caseId, {
        targetAccountCode: suspenseAccountCode,
        allocateTransactionAmount: amount,
      })
      pushToast({ type: 'success', message: `Suspense case #${caseId} allocated.` })
      void suspenseQuery.refetch()
      void trialBalanceQuery.refetch()
    } catch {
      pushToast({ type: 'error', message: `Failed to allocate suspense case #${caseId}.` })
    }
  }

  const loading = accountsQuery.isLoading || trialBalanceQuery.isLoading
  const error = accountsQuery.isError || trialBalanceQuery.isError
  const selectedCoaVersion = (coaQuery.data || []).find((version) => version.id === selectedCoaVersionId) || null

  const batchSummaryText = (run: Record<string, unknown> | null | undefined) => {
    if (!run) {
      return 'No summary captured'
    }
    const trial = typeof run.trial === 'object' && run.trial ? run.trial as Record<string, unknown> : null
    const accrual = typeof run.accrual === 'object' && run.accrual ? run.accrual as Record<string, unknown> : null
    const fragments = [
      trial ? `rows ${Number(trial.rowCount || 0)}` : null,
      trial ? `locked ${trial.lockCreated ? 'new' : trial.alreadyLocked ? 'existing' : 'none'}` : null,
      accrual ? `accrued ${formatMoney(Number(accrual.accruedAmount || 0))}` : null,
    ].filter(Boolean)
    return fragments.join(' | ') || 'No summary captured'
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>GL / Accounting Dashboard</h1>
          <p className={styles.muted}>Audit controls: multi-currency FX, EOD/EOM/EOY batches, suspense reconciliation, and CoA versioning.</p>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}><span>Date from</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label className={styles.inputGroup}><span>Date to</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label className={styles.inputGroup}><span>Branch ID</span><input type="number" min={1} value={branchId} onChange={(event) => setBranchId(event.target.value)} placeholder="All" /></label>
          <div className={styles.actions}>
            <button type="button" disabled={exportingFormat !== null} onClick={() => void exportTrialBalance('csv')}>Export CSV</button>
            <button type="button" disabled={exportingFormat !== null} onClick={() => void exportTrialBalance('xlsx')}>Export XLSX</button>
            <button type="button" disabled={exportingFormat !== null} onClick={() => void exportTrialBalance('pdf')}>Export PDF</button>
          </div>
        </div>
      </section>

      <AsyncState loading={loading} error={error} empty={false} loadingText="Loading accounting data..." errorText="Unable to load accounting data." onRetry={() => { void Promise.all([accountsQuery.refetch(), trialBalanceQuery.refetch()]) }} />

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Trial balance</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Code</th><th>Account</th><th>Debits</th><th>Credits</th><th>Net</th></tr></thead>
            <tbody>
              {(trialBalanceQuery.data?.rows || []).map((row) => (
                <tr key={row.id}><td className={styles.mono}>{row.code}</td><td>{row.name}</td><td>{formatMoney(row.debits)}</td><td>{formatMoney(row.credits)}</td><td>{formatMoney(row.net)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Suspense fallback={<section className={styles.panel}><p className={styles.muted}>Loading accounting operations...</p></section>}>
        <AccountingOperationsPanels
          batchDate={batchDate}
          onBatchDateChange={setBatchDate}
          runBatchAndRefresh={runBatchAndRefresh}
          batches={batchesQuery.data || []}
          periodLocks={periodLocksQuery.data || []}
          batchSummaryText={batchSummaryText}
          fxBase={fxBase}
          fxQuote={fxQuote}
          fxRate={fxRate}
          onFxBaseChange={setFxBase}
          onFxQuoteChange={setFxQuote}
          onFxRateChange={setFxRate}
          saveFxRate={saveFxRate}
          fxRates={fxRatesQuery.data || []}
          coaCode={coaCode}
          coaName={coaName}
          onCoaCodeChange={setCoaCode}
          onCoaNameChange={setCoaName}
          createCoa={createCoa}
          coaVersions={coaQuery.data || []}
          selectedCoaVersionId={selectedCoaVersionId}
          onSelectedCoaVersionIdChange={setSelectedCoaVersionId}
          activateVersion={async (versionId) => {
            await activateGlCoaVersion(versionId)
            await coaQuery.refetch()
          }}
          selectedCoaVersionLabel={selectedCoaVersion?.version_code || null}
          coaAccounts={coaAccountsQuery.data || []}
          suspenseAmount={suspenseAmount}
          suspenseCurrency={suspenseCurrency}
          suspenseAccountCode={suspenseAccountCode}
          onSuspenseAmountChange={setSuspenseAmount}
          onSuspenseCurrencyChange={setSuspenseCurrency}
          onSuspenseAccountCodeChange={setSuspenseAccountCode}
          createSuspense={createSuspense}
          suspenseCases={suspenseQuery.data || []}
          allocateSuspense={allocateSuspense}
          accounts={accountsQuery.data || []}
          selectedAccountId={selectedAccountId}
          onSelectedAccountIdChange={setSelectedAccountId}
          accountStatementEntryCount={accountStatementQuery.data?.entries.length || 0}
        />
      </Suspense>
    </div>
  )
}
