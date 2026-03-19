import type {
  GlAccount,
  GlAccountStatementPayload,
  GlBatchRun,
  GlCoaVersion,
  GlCoaVersionAccount,
  GlFxRate,
  GlPeriodLock,
  GlSuspenseCase,
} from '../../../types/gl'
import styles from '../styles/Accounting.module.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | undefined | null) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

function statusBadge(status: string) {
  const s = String(status || '').toLowerCase()
  if (s === 'completed' || s === 'active' || s === 'resolved') return styles.badgeSuccess
  if (s === 'running' || s === 'open' || s === 'partially_allocated') return styles.badgePending
  if (s === 'failed' || s === 'inactive') return styles.badgeDanger
  return styles.badgeMuted
}

function batchSummaryText(run: GlBatchRun): string {
  const s = run.summary
  if (!s) return 'No summary'
  const trial = typeof s.trial === 'object' && s.trial ? (s.trial as Record<string, unknown>) : null
  const accrual = typeof s.accrual === 'object' && s.accrual ? (s.accrual as Record<string, unknown>) : null
  const parts: string[] = []
  if (trial) {
    parts.push(`${Number(trial.rowCount || 0)} rows`)
    if (trial.lockCreated) parts.push('new lock')
    else if (trial.alreadyLocked) parts.push('existing lock')
  }
  if (accrual) parts.push(`accrued ${fmt(Number(accrual.accruedAmount || 0))}`)
  return parts.length ? parts.join(' · ') : 'Complete'
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type AccountingTabKey = 'trial-balance' | 'batch' | 'fx' | 'coa' | 'suspense' | 'ledger'

type BatchPanelProps = {
  batchDate: string
  onBatchDateChange: (v: string) => void
  onRunBatch: (type: 'eod' | 'eom' | 'eoy') => Promise<void>
  batches: GlBatchRun[]
  periodLocks: GlPeriodLock[]
  pendingBatch: string | null
  onConfirmBatch: (type: 'eod' | 'eom' | 'eoy') => void
  onCancelConfirm: () => void
  confirmingBatch: 'eod' | 'eom' | 'eoy' | null
}

type FxPanelProps = {
  fxBase: string
  fxQuote: string
  fxRate: string
  onFxBaseChange: (v: string) => void
  onFxQuoteChange: (v: string) => void
  onFxRateChange: (v: string) => void
  onSaveFxRate: () => Promise<void>
  fxRates: GlFxRate[]
}

type CoaPanelProps = {
  coaCode: string
  coaName: string
  onCoaCodeChange: (v: string) => void
  onCoaNameChange: (v: string) => void
  onCreateCoa: () => Promise<void>
  coaVersions: GlCoaVersion[]
  selectedCoaVersionId: number | null
  onSelectCoaVersion: (id: number | null) => void
  onActivateVersion: (id: number) => Promise<void>
  coaAccounts: GlCoaVersionAccount[]
}

type SuspensePanelProps = {
  suspenseAmount: string
  suspenseCurrency: string
  suspenseAccountCode: string
  onSuspenseAmountChange: (v: string) => void
  onSuspenseCurrencyChange: (v: string) => void
  onSuspenseAccountCodeChange: (v: string) => void
  onCreateSuspense: () => Promise<void>
  suspenseCases: GlSuspenseCase[]
  onAllocateSuspense: (caseId: number, amount: number) => Promise<void>
  accounts: GlAccount[]
}

type LedgerPanelProps = {
  accounts: GlAccount[]
  selectedAccountId: number | null
  onSelectAccount: (id: number | null) => void
  statement: GlAccountStatementPayload | null
  statementLoading: boolean
}

// ─── Batch Close Panel ────────────────────────────────────────────────────────

export function BatchPanel({
  batchDate,
  onBatchDateChange,
  onRunBatch,
  batches,
  periodLocks,
  pendingBatch,
  onConfirmBatch,
  onCancelConfirm,
  confirmingBatch,
}: BatchPanelProps) {
  const BATCH_LABELS = { eod: 'End of Day', eom: 'End of Month', eoy: 'End of Year' }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.panelRow}>
          <h2 className={styles.panelTitle}>Run batch close</h2>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Effective date</span>
            <input type="date" value={batchDate} onChange={(e) => onBatchDateChange(e.target.value)} />
          </label>
          <div className={styles.fieldActions}>
            {(['eod', 'eom', 'eoy'] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.btn} ${type === 'eoy' ? styles.btnDanger : ''}`}
                disabled={pendingBatch !== null}
                onClick={() => onConfirmBatch(type)}
              >
                Run {type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className={styles.muted}>
          EOD posts daily interest accruals and closes the trading period. EOM locks the calendar month.
          EOY closes the financial year — this action cannot be undone.
        </p>
      </div>

      {/* Batch history */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Batch history</h2>
        {batches.length === 0 ? (
          <p className={styles.muted}>No batch runs recorded yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Effective date</th>
                  <th>Status</th>
                  <th>Completed</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((run) => (
                  <tr key={run.id}>
                    <td><span className={styles.mono}>{String(run.batch_type).toUpperCase()}</span></td>
                    <td>{fmtDate(run.effective_date)}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.completed_at ? fmtDate(run.completed_at) : <em className={styles.muted}>Running…</em>}</td>
                    <td className={styles.muted}>{batchSummaryText(run)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Period locks */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Period locks</h2>
        {periodLocks.length === 0 ? (
          <p className={styles.muted}>No period locks recorded.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Lock type</th>
                  <th>Lock date</th>
                  <th>Status</th>
                  <th>Locked at</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {periodLocks.map((lock) => (
                  <tr key={lock.id}>
                    <td><span className={styles.mono}>{String(lock.lock_type).toUpperCase()}</span></td>
                    <td>{fmtDate(lock.lock_date)}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(lock.status)}`}>
                        {lock.status}
                      </span>
                    </td>
                    <td>{fmtDate(lock.locked_at)}</td>
                    <td className={styles.muted}>{lock.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirmingBatch && (
        <div className={styles.overlay} role="presentation" onClick={onCancelConfirm}>
          <div
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.confirmTitle}>
              Run {BATCH_LABELS[confirmingBatch]}?
            </h2>
            <p className={styles.confirmText}>
              You are about to run the <strong>{BATCH_LABELS[confirmingBatch]}</strong> batch for{' '}
              <strong>{batchDate}</strong>. This will post accruals, update period locks, and refresh
              the trial balance.
            </p>
            {confirmingBatch === 'eoy' && (
              <p className={styles.confirmWarning}>
                End-of-Year close is irreversible. Ensure all EOM batches for the year are complete
                before proceeding.
              </p>
            )}
            <div className={styles.confirmActions}>
              <button type="button" className={styles.btn} onClick={onCancelConfirm}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.btn} ${confirmingBatch === 'eoy' ? styles.btnDanger : styles.btnPrimary}`}
                onClick={() => { void onRunBatch(confirmingBatch) }}
              >
                Confirm — run {confirmingBatch.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── FX Rates Panel ───────────────────────────────────────────────────────────

export function FxPanel({
  fxBase, fxQuote, fxRate,
  onFxBaseChange, onFxQuoteChange, onFxRateChange,
  onSaveFxRate, fxRates,
}: FxPanelProps) {
  return (
    <>
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Add FX rate</h2>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Base currency</span>
            <input
              value={fxBase}
              maxLength={3}
              style={{ textTransform: 'uppercase', width: 80 }}
              onChange={(e) => onFxBaseChange(e.target.value.toUpperCase())}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Quote currency</span>
            <input
              value={fxQuote}
              maxLength={3}
              style={{ textTransform: 'uppercase', width: 80 }}
              onChange={(e) => onFxQuoteChange(e.target.value.toUpperCase())}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Rate</span>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={fxRate}
              placeholder="e.g. 128.50"
              style={{ width: 130 }}
              onChange={(e) => onFxRateChange(e.target.value)}
            />
          </label>
          <div className={styles.fieldActions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void onSaveFxRate()}>
              Save rate
            </button>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Current rates</h2>
        {fxRates.length === 0 ? (
          <p className={styles.muted}>No FX rates recorded.</p>
        ) : (
          <div className={styles.fxGrid}>
            {fxRates.map((row) => (
              <div key={row.id} className={styles.fxCard}>
                <div className={styles.fxPair}>{row.base_currency} / {row.quote_currency}</div>
                <div className={styles.fxRate}>{Number(row.rate).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}</div>
                <div className={styles.fxDate}>Updated {fmtDate(row.quoted_at || row.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── CoA Versions Panel ───────────────────────────────────────────────────────

export function CoaPanel({
  coaCode, coaName,
  onCoaCodeChange, onCoaNameChange, onCreateCoa,
  coaVersions, selectedCoaVersionId, onSelectCoaVersion,
  onActivateVersion, coaAccounts,
}: CoaPanelProps) {
  const selected = coaVersions.find((v) => v.id === selectedCoaVersionId) || null

  return (
    <>
      {/* Create new version */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Create CoA version</h2>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Version code</span>
            <input
              value={coaCode}
              placeholder="e.g. V2025"
              style={{ textTransform: 'uppercase', width: 120 }}
              onChange={(e) => onCoaCodeChange(e.target.value.toUpperCase())}
            />
          </label>
          <label className={styles.field} style={{ flex: 1, minWidth: 200 }}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              value={coaName}
              placeholder="e.g. FY2025 Chart of Accounts"
              onChange={(e) => onCoaNameChange(e.target.value)}
            />
          </label>
          <div className={styles.fieldActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!coaCode.trim() || !coaName.trim()}
              onClick={() => void onCreateCoa()}
            >
              Create version
            </button>
          </div>
        </div>
      </div>

      {/* Version list */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Versions</h2>
        {coaVersions.length === 0 ? (
          <p className={styles.muted}>No CoA versions defined.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th className={styles.tdRight}>Accounts</th>
                  <th>Effective from</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {coaVersions.map((row) => (
                  <tr
                    key={row.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectCoaVersion(row.id)}
                  >
                    <td><span className={styles.mono}>{row.version_code}</span></td>
                    <td>{row.name}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className={styles.tdRight}>{row.account_count}</td>
                    <td>{fmtDate(row.effective_from)}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={row.status === 'active'}
                        onClick={(e) => { e.stopPropagation(); void onActivateVersion(row.id) }}
                      >
                        {row.status === 'active' ? 'Active' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Account list for selected version */}
      {selected && (
        <div className={styles.panel}>
          <div className={styles.panelRow}>
            <h2 className={styles.panelTitle}>
              {selected.version_code} — {coaAccounts.length} accounts
            </h2>
            <span className={`${styles.badge} ${statusBadge(selected.status)}`}>{selected.status}</span>
          </div>
          {coaAccounts.length === 0 ? (
            <p className={styles.muted}>No accounts in this version.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Contra</th>
                    <th>Posting</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {coaAccounts.map((acc) => (
                    <tr key={acc.id}>
                      <td><span className={styles.mono}>{acc.code}</span></td>
                      <td>{acc.name}</td>
                      <td>{acc.account_type}</td>
                      <td className={styles.tdCenter}>{acc.is_contra ? 'Yes' : '—'}</td>
                      <td>
                        <span className={`${styles.badge} ${acc.is_posting_allowed ? styles.badgeSuccess : styles.badgeMuted}`}>
                          {acc.is_posting_allowed ? 'Posting' : 'Header'}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${acc.is_active ? styles.badgeSuccess : styles.badgeMuted}`}>
                          {acc.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ─── Suspense Workflow Panel ──────────────────────────────────────────────────

export function SuspensePanel({
  suspenseAmount, suspenseCurrency, suspenseAccountCode,
  onSuspenseAmountChange, onSuspenseCurrencyChange, onSuspenseAccountCodeChange,
  onCreateSuspense, suspenseCases, onAllocateSuspense, accounts,
}: SuspensePanelProps) {
  const openCases = suspenseCases.filter((c) => c.status !== 'resolved')
  const resolvedCases = suspenseCases.filter((c) => c.status === 'resolved')

  return (
    <>
      {/* Open cases KPI */}
      {openCases.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelRow}>
            <h2 className={styles.panelTitle}>Open suspense cases</h2>
            <span className={`${styles.badge} ${styles.badgePending}`}>{openCases.length} open</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Status</th>
                  <th className={styles.tdRight}>Original amount</th>
                  <th className={styles.tdRight}>Remaining</th>
                  <th>Received</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {openCases.map((row) => (
                  <tr key={row.id}>
                    <td><span className={styles.mono}>#{row.id}</span></td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(row.status)}`}>
                        {row.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={styles.tdRight}>
                      {fmt(row.transaction_amount)} {row.transaction_currency}
                    </td>
                    <td className={styles.tdRight}>
                      {fmt(row.transaction_amount_remaining)} {row.transaction_currency}
                    </td>
                    <td>{fmtDate(row.received_at)}</td>
                    <td className={styles.muted}>{row.note || row.description || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => void onAllocateSuspense(row.id, row.transaction_amount_remaining)}
                      >
                        Allocate full
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create suspense case */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Create suspense case</h2>
        <div className={styles.toolbar}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Amount</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={suspenseAmount}
              placeholder="0.00"
              style={{ width: 130 }}
              onChange={(e) => onSuspenseAmountChange(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Currency</span>
            <input
              value={suspenseCurrency}
              maxLength={3}
              style={{ textTransform: 'uppercase', width: 80 }}
              onChange={(e) => onSuspenseCurrencyChange(e.target.value.toUpperCase())}
            />
          </label>
          <label className={styles.field} style={{ minWidth: 200 }}>
            <span className={styles.fieldLabel}>Target account</span>
            <select
              value={suspenseAccountCode}
              onChange={(e) => onSuspenseAccountCodeChange(e.target.value)}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.code}>
                  {acc.code} — {acc.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.fieldActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!suspenseAmount || Number(suspenseAmount) <= 0}
              onClick={() => void onCreateSuspense()}
            >
              Create case
            </button>
          </div>
        </div>
      </div>

      {/* Resolved cases (collapsed summary) */}
      {resolvedCases.length > 0 && (
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Resolved cases ({resolvedCases.length})</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Case #</th>
                  <th className={styles.tdRight}>Amount</th>
                  <th>Currency</th>
                  <th>Resolved at</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {resolvedCases.slice(0, 10).map((row) => (
                  <tr key={row.id}>
                    <td><span className={styles.mono}>#{row.id}</span></td>
                    <td className={styles.tdRight}>{fmt(row.transaction_amount)}</td>
                    <td>{row.transaction_currency}</td>
                    <td>{fmtDate(row.resolved_at)}</td>
                    <td className={styles.muted}>{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resolvedCases.length > 10 && (
            <p className={styles.muted}>Showing 10 of {resolvedCases.length} resolved cases.</p>
          )}
        </div>
      )}

      {suspenseCases.length === 0 && (
        <div className={styles.stateBox}>
          <p>No suspense cases on record.</p>
        </div>
      )}
    </>
  )
}

// ─── Account Ledger Panel ─────────────────────────────────────────────────────

export function LedgerPanel({
  accounts, selectedAccountId, onSelectAccount,
  statement, statementLoading,
}: LedgerPanelProps) {
  const summary = statement?.summary
  const entries = statement?.entries || []
  const account = statement?.account

  return (
    <>
      {/* Account selector */}
      <div className={styles.panel}>
        <h2 className={styles.panelTitle}>Select account</h2>
        <div className={styles.toolbar}>
          <label className={styles.field} style={{ flex: 1, minWidth: 280 }}>
            <span className={styles.fieldLabel}>Account</span>
            <select
              value={selectedAccountId || ''}
              onChange={(e) => onSelectAccount(Number(e.target.value) || null)}
            >
              <option value="">— choose an account —</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} — {acc.name} ({acc.account_type})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {statementLoading && (
        <div className={styles.stateBox}>
          <div className={styles.spinner} />
          <span>Loading statement…</span>
        </div>
      )}

      {!statementLoading && statement && account && (
        <>
          {/* Statement summary KPIs */}
          <div className={styles.panel}>
            <div className={styles.panelRow}>
              <h2 className={styles.panelTitle}>{account.code} — {account.name}</h2>
              <span className={`${styles.badge} ${account.is_active ? styles.badgeSuccess : styles.badgeMuted}`}>
                {account.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className={styles.statementSummary}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Total debits</div>
                <div className={styles.kpiValue}>{fmt(summary?.total_debits)}</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Total credits</div>
                <div className={styles.kpiValue}>{fmt(summary?.total_credits)}</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Closing balance</div>
                <div className={styles.kpiValue}>{fmt(summary?.closing_balance)}</div>
              </div>
              <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Entry count</div>
                <div className={styles.kpiValue}>{summary?.entry_count ?? entries.length}</div>
              </div>
            </div>
          </div>

          {/* Journal entries */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Journal entries</h2>
            {entries.length === 0 ? (
              <p className={styles.muted}>No entries in the selected period.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Journal</th>
                      <th>Reference</th>
                      <th>Side</th>
                      <th className={styles.tdRight}>Debit</th>
                      <th className={styles.tdRight}>Credit</th>
                      <th className={styles.tdRight}>Running balance</th>
                      <th>Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{fmtDate(entry.posted_at)}</td>
                        <td><span className={styles.mono}>#{entry.journal_id}</span></td>
                        <td className={styles.muted}>
                          {entry.reference_type
                            ? `${entry.reference_type} #${entry.reference_id ?? '—'}`
                            : '—'}
                        </td>
                        <td>
                          <span className={`${styles.badge} ${entry.side === 'debit' ? styles.badgeDanger : styles.badgeSuccess}`}>
                            {entry.side}
                          </span>
                        </td>
                        <td className={`${styles.tdRight} ${styles.mono}`}>
                          {entry.debit_amount ? fmt(entry.debit_amount) : '—'}
                        </td>
                        <td className={`${styles.tdRight} ${styles.mono}`}>
                          {entry.credit_amount ? fmt(entry.credit_amount) : '—'}
                        </td>
                        <td className={`${styles.tdRight} ${styles.mono}`}>
                          {fmt(entry.running_balance)}
                        </td>
                        <td className={styles.muted}>
                          {entry.memo || entry.description || entry.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!statementLoading && !statement && selectedAccountId && (
        <div className={styles.stateBox}>
          <p className={styles.muted}>No statement data available for this account.</p>
        </div>
      )}
    </>
  )
}
