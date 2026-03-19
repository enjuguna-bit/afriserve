import styles from '../../shared/styles/EntityPage.module.css'

type TableRow = Record<string, unknown>

type AccountingOperationsPanelsProps = {
  batchDate: string
  onBatchDateChange: (value: string) => void
  runBatchAndRefresh: (batchType: 'eod' | 'eom' | 'eoy') => Promise<void>
  batches: TableRow[]
  periodLocks: TableRow[]
  batchSummaryText: (run: Record<string, unknown> | null | undefined) => string
  fxBase: string
  fxQuote: string
  fxRate: string
  onFxBaseChange: (value: string) => void
  onFxQuoteChange: (value: string) => void
  onFxRateChange: (value: string) => void
  saveFxRate: () => Promise<void>
  fxRates: TableRow[]
  coaCode: string
  coaName: string
  onCoaCodeChange: (value: string) => void
  onCoaNameChange: (value: string) => void
  createCoa: () => Promise<void>
  coaVersions: TableRow[]
  selectedCoaVersionId: number | null
  onSelectedCoaVersionIdChange: (value: number | null) => void
  activateVersion: (versionId: number) => Promise<void>
  selectedCoaVersionLabel: string | null
  coaAccounts: TableRow[]
  suspenseAmount: string
  suspenseCurrency: string
  suspenseAccountCode: string
  onSuspenseAmountChange: (value: string) => void
  onSuspenseCurrencyChange: (value: string) => void
  onSuspenseAccountCodeChange: (value: string) => void
  createSuspense: () => Promise<void>
  suspenseCases: TableRow[]
  allocateSuspense: (caseId: number, amount: number) => Promise<void>
  accounts: TableRow[]
  selectedAccountId: number | null
  onSelectedAccountIdChange: (value: number | null) => void
  accountStatementEntryCount: number
}

function formatMoney(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function AccountingOperationsPanels({
  batchDate,
  onBatchDateChange,
  runBatchAndRefresh,
  batches,
  periodLocks,
  batchSummaryText,
  fxBase,
  fxQuote,
  fxRate,
  onFxBaseChange,
  onFxQuoteChange,
  onFxRateChange,
  saveFxRate,
  fxRates,
  coaCode,
  coaName,
  onCoaCodeChange,
  onCoaNameChange,
  createCoa,
  coaVersions,
  selectedCoaVersionId,
  onSelectedCoaVersionIdChange,
  activateVersion,
  selectedCoaVersionLabel,
  coaAccounts,
  suspenseAmount,
  suspenseCurrency,
  suspenseAccountCode,
  onSuspenseAmountChange,
  onSuspenseCurrencyChange,
  onSuspenseAccountCodeChange,
  createSuspense,
  suspenseCases,
  allocateSuspense,
  accounts,
  selectedAccountId,
  onSelectedAccountIdChange,
  accountStatementEntryCount,
}: AccountingOperationsPanelsProps) {
  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Batch close</h2>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}><span>Effective date</span><input type="date" value={batchDate} onChange={(event) => onBatchDateChange(event.target.value)} /></label>
          <div className={styles.actions}>
            <button type="button" onClick={() => void runBatchAndRefresh('eod')}>Run EOD</button>
            <button type="button" onClick={() => void runBatchAndRefresh('eom')}>Run EOM</button>
            <button type="button" onClick={() => void runBatchAndRefresh('eoy')}>Run EOY</button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Batch</th><th>Effective date</th><th>Status</th><th>Completed</th><th>Summary</th></tr></thead>
            <tbody>
              {batches.map((run) => (
                <tr key={String(run.id)}>
                  <td className={styles.mono}>{String(run.batch_type || '').toUpperCase()}</td>
                  <td>{String(run.effective_date || '-')}</td>
                  <td>{String(run.status || '-')}</td>
                  <td>{String(run.completed_at || 'Running')}</td>
                  <td>{batchSummaryText(run)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Lock</th><th>Date</th><th>Status</th><th>Batch</th><th>Note</th></tr></thead>
            <tbody>
              {periodLocks.map((lock) => (
                <tr key={String(lock.id)}>
                  <td className={styles.mono}>{String(lock.lock_type || '').toUpperCase()}</td>
                  <td>{String(lock.lock_date || '-')}</td>
                  <td>{String(lock.status || '-')}</td>
                  <td>{String(lock.batch_status || 'Manual')}</td>
                  <td>{String(lock.note || 'No note')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>FX rates</h2>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}><span>Base</span><input value={fxBase} onChange={(event) => onFxBaseChange(event.target.value)} /></label>
          <label className={styles.inputGroup}><span>Quote</span><input value={fxQuote} onChange={(event) => onFxQuoteChange(event.target.value)} /></label>
          <label className={styles.inputGroup}><span>Rate</span><input type="number" min={0} step="0.000001" value={fxRate} onChange={(event) => onFxRateChange(event.target.value)} /></label>
          <div className={styles.actions}><button type="button" onClick={() => void saveFxRate()}>Save rate</button></div>
        </div>
        <p className={styles.muted}>Latest: {fxRates.map((row) => `${row.base_currency}/${row.quote_currency}=${row.rate}`).join(' | ') || 'none'}</p>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>CoA versions</h2>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}><span>Code</span><input value={coaCode} onChange={(event) => onCoaCodeChange(event.target.value)} /></label>
          <label className={styles.inputGroup}><span>Name</span><input value={coaName} onChange={(event) => onCoaNameChange(event.target.value)} /></label>
          <label className={styles.inputGroup}>
            <span>Inspect version</span>
            <select value={selectedCoaVersionId || ''} onChange={(event) => onSelectedCoaVersionIdChange(Number(event.target.value) || null)}>
              {coaVersions.map((version) => <option key={String(version.id)} value={String(version.id)}>{String(version.version_code)}</option>)}
            </select>
          </label>
          <div className={styles.actions}><button type="button" onClick={() => void createCoa()}>Create version</button></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Accounts</th><th>Action</th></tr></thead>
            <tbody>
              {coaVersions.map((row) => (
                <tr key={String(row.id)}>
                  <td className={styles.mono}>{String(row.version_code)}</td>
                  <td>{String(row.name)}</td>
                  <td>{String(row.status)}</td>
                  <td>{String(row.account_count)}</td>
                  <td><button type="button" disabled={String(row.status) === 'active'} onClick={() => void activateVersion(Number(row.id))}>Activate</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>{selectedCoaVersionLabel ? `Inspecting ${selectedCoaVersionLabel} with ${coaAccounts.length} account rows.` : 'Select a CoA version to inspect its account set.'}</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Posting</th><th>Active</th></tr></thead>
            <tbody>
              {coaAccounts.map((account) => (
                <tr key={String(account.id)}>
                  <td className={styles.mono}>{String(account.code)}</td>
                  <td>{String(account.name)}</td>
                  <td>{String(account.account_type)}{account.is_contra ? ' contra' : ''}</td>
                  <td>{account.is_posting_allowed ? 'Posting' : 'Header only'}</td>
                  <td>{account.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Suspense workflow</h2>
        <div className={styles.toolbar}>
          <label className={styles.inputGroup}><span>Amount</span><input type="number" min={0} step="0.01" value={suspenseAmount} onChange={(event) => onSuspenseAmountChange(event.target.value)} /></label>
          <label className={styles.inputGroup}><span>Currency</span><input value={suspenseCurrency} onChange={(event) => onSuspenseCurrencyChange(event.target.value)} /></label>
          <label className={styles.inputGroup}>
            <span>Target account</span>
            <select value={suspenseAccountCode} onChange={(event) => onSuspenseAccountCodeChange(event.target.value)}>
              {accounts.map((account) => <option key={String(account.id)} value={String(account.code)}>{String(account.code)}</option>)}
            </select>
          </label>
          <div className={styles.actions}><button type="button" onClick={() => void createSuspense()}>Create suspense case</button></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Case</th><th>Status</th><th>Remaining</th><th>Action</th></tr></thead>
            <tbody>
              {suspenseCases.map((row) => (
                <tr key={String(row.id)}>
                  <td>#{String(row.id)}</td>
                  <td>{String(row.status)}</td>
                  <td>{formatMoney(Number(row.transaction_amount_remaining || 0))} {String(row.transaction_currency || '')}</td>
                  <td><button type="button" onClick={() => void allocateSuspense(Number(row.id), Number(row.transaction_amount_remaining || 0))}>Allocate full</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Account statement</h2>
        <label className={styles.inputGroupWide}>
          <span>Account</span>
          <select value={selectedAccountId || ''} onChange={(event) => onSelectedAccountIdChange(Number(event.target.value) || null)}>
            {accounts.map((account) => <option key={String(account.id)} value={String(account.id)}>{String(account.code)} - {String(account.name)}</option>)}
          </select>
        </label>
        <p className={styles.muted}>Entries: {accountStatementEntryCount}</p>
      </section>
    </>
  )
}
