import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCashFlowReport, getGlCashFlowReport, downloadReport } from '../../../services/reportService'
import { listCapitalTransactions } from '../../../services/capitalService'
import { downloadBlob } from '../../../utils/fileDownload'
import { useToastStore } from '../../../store/toastStore'
import { feedback } from '../../../utils/feedback'
import { queryPolicies } from '../../../services/queryPolicies'
import styles from '../styles/StakeholderPage.module.css'
import {
  BarChartWrapper,
  DonutChartWrapper,
  ChartContainer,
  CHART_COLORS,
} from '../../../components/charts'

// ── Types ─────────────────────────────────────────────────────────────────────

type CashFlowReport = {
  total_inflow?: number
  total_outflow?: number
  net_cash_flow?: number
  capital_deposits?: number
  capital_withdrawals?: number
  pending_withdrawals?: number
  period?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number | undefined) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function barWidth(part: number, total: number): string {
  if (!total) return '0%'
  return `${Math.min(100, (Math.abs(part) / total) * 100).toFixed(1)}%`
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return value }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StakeholderCashFlowPage() {
  const pushToast = useToastStore((s) => s.pushToast)
  const [exporting, setExporting] = useState<string | null>(null)

  const cashQuery = useQuery({
    queryKey: ['stakeholder', 'cashflow'],
    queryFn: () => getCashFlowReport(),
    ...queryPolicies.report,
  })

  const glCashQuery = useQuery({
    queryKey: ['stakeholder', 'gl-cashflow'],
    queryFn: () => getGlCashFlowReport(),
    ...queryPolicies.report,
  })

  const capitalQuery = useQuery({
    queryKey: ['stakeholder', 'capital-transactions-recent'],
    queryFn: () => listCapitalTransactions({ status: 'approved', limit: 10, offset: 0 }),
    ...queryPolicies.report,
  })

  const pendingQuery = useQuery({
    queryKey: ['stakeholder', 'capital-pending-withdrawals'],
    queryFn: () => listCapitalTransactions({ type: 'withdrawal', status: 'pending', limit: 20, offset: 0 }),
    ...queryPolicies.report,
  })

  const data = (cashQuery.data || {}) as CashFlowReport
  const inflow             = Number(data.total_inflow        || 0)
  const outflow            = Number(data.total_outflow       || 0)
  const net                = Number(data.net_cash_flow       || 0)
  const capitalDeposits    = Number(data.capital_deposits    || 0)
  const capitalWithdrawals = Number(data.capital_withdrawals || 0)
  const pendingWithdrawals = Number(data.pending_withdrawals || 0)
  const isPositive = net >= 0
  const maxFlow = Math.max(inflow, outflow, 1)

  const glData     = (glCashQuery.data || {}) as Record<string, unknown>
  const capitalTxns = capitalQuery.data?.data  ?? []
  const pendingTxns = pendingQuery.data?.data  ?? []
  const pendingTotal = pendingQuery.data?.paging?.total ?? 0

  // ── Chart data ────────────────────────────────────────────────────────────
  // Grouped bar: inflow vs outflow
  const flowBarData = [
    { label: 'Inflow',  value: inflow,  color: CHART_COLORS.emerald },
    { label: 'Outflow', value: outflow, color: CHART_COLORS.red     },
    { label: 'Net',     value: Math.abs(net), color: isPositive ? CHART_COLORS.blue : '#f97316' },
  ]

  // Donut: capital deposits vs withdrawals (only when both exist)
  const capitalDonutData = [
    capitalDeposits    > 0 ? { name: 'Deposits',    value: capitalDeposits,    color: CHART_COLORS.emerald } : null,
    capitalWithdrawals > 0 ? { name: 'Withdrawals', value: capitalWithdrawals, color: CHART_COLORS.red     } : null,
    pendingWithdrawals > 0 ? { name: 'Pending',     value: pendingWithdrawals, color: CHART_COLORS.gold    } : null,
  ].filter(Boolean) as { name: string; value: number; color: string }[]

  const hasCapitalDonut = capitalDonutData.length > 1

  const handleExport = async (format: 'csv' | 'xlsx') => {
    const key = `cashflow-${format}`
    setExporting(key)
    try {
      const { blob, filename } = await downloadReport('/reports/performance/cashflow', {}, format)
      downloadBlob(blob, filename || `cashflow.${format}`)
      pushToast({ type: 'success', message: feedback.system.exportReady('cash flow') })
    } catch {
      pushToast({ type: 'error', message: 'Could not export the cash flow report. Please try again.' })
    } finally {
      setExporting(null)
    }
  }

  const isLoading = cashQuery.isLoading
  const isError   = cashQuery.isError

  return (
    <div className={styles.page}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Stakeholders · Cash Flow</p>
          <h1 className={styles.pageTitle}>Cash flow status</h1>
          <p className={styles.pageSubtitle}>
            Cumulative fund movements synchronised with the general ledger, including
            approved capital deposits and withdrawals.
            {data.period ? ` Period: ${data.period}.` : ' Lifetime continuous.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/stakeholders/capital" className={styles.exportBtn} style={{ textDecoration: 'none' }}>
            Capital transactions
          </Link>
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exporting !== null || isLoading}
            onClick={() => void handleExport('csv')}
          >
            {exporting === 'cashflow-csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exporting !== null || isLoading}
            onClick={() => void handleExport('xlsx')}
          >
            {exporting === 'cashflow-xlsx' ? 'Exporting…' : 'Export XLSX'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading cash flow data…</span>
        </div>
      )}
      {isError && (
        <div className={styles.errorState}>
          <strong>Could not load cash flow data.</strong>
          <button type="button" onClick={() => void cashQuery.refetch()}>Retry</button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* ── Net position headline ────────────────────────────────────── */}
          <div className={`${styles.headlineCard} ${isPositive ? styles.headlinePositive : styles.headlineNegative}`}>
            <div className={styles.headlineLabel}>Net cash position</div>
            <div className={styles.headlineValue}>
              {isPositive ? '' : '−'}Ksh {fmt(Math.abs(net))}
            </div>
            <div className={styles.headlineSub}>
              {isPositive
                ? 'Positive — inflows exceed outflows'
                : 'Negative — outflows exceed inflows'}
              {pendingWithdrawals > 0 && (
                <span className={styles.headlineWarn}>
                  {' '}· Ksh {fmt(pendingWithdrawals)} in pending withdrawals not yet applied
                </span>
              )}
            </div>
          </div>

          {/* ── 📊 Inflow vs Outflow bar chart ──────────────────────────── */}
          <div className={styles.chartRow}>
            <ChartContainer
              title="Inflow vs Outflow vs Net"
              subtitle="Lifetime cumulative fund movements (Ksh)"
              height={200}
              style={{ flex: 2, minWidth: 280 }}
            >
              <BarChartWrapper
                data={flowBarData}
                xKey="label"
                yKey="value"
                height={200}
              />
            </ChartContainer>

            {/* Net position callout beside the chart */}
            <div className={styles.chartLegendCard} style={{ flex: 1, minWidth: 180 }}>
              <p className={styles.chartLegendTitle}>Summary</p>
              {flowBarData.map((d) => (
                <div key={d.label} className={styles.chartLegendRow}>
                  <span className={styles.chartLegendDot} style={{ background: d.color }} />
                  <span className={styles.chartLegendLabel}>{d.label}</span>
                  <span className={styles.chartLegendValue} style={{ color: d.color }}>
                    Ksh {fmt(d.value)}
                  </span>
                </div>
              ))}
              <div style={{
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 10,
                background: isPositive ? 'rgba(0,220,150,0.07)' : 'rgba(239,68,68,0.07)',
                border: `1px solid ${isPositive ? 'rgba(0,220,150,0.2)' : 'rgba(239,68,68,0.2)'}`,
                fontSize: '0.8rem',
                color: isPositive ? CHART_COLORS.emerald : CHART_COLORS.red,
                fontWeight: 600,
              }}>
                {isPositive ? '↑ Surplus position' : '↓ Deficit position'}
              </div>
            </div>
          </div>

          {/* ── Operational flow cards ───────────────────────────────────── */}
          <div className={styles.flowGrid}>
            <div className={styles.flowCard}>
              <div className={styles.flowLabel}>Total inflow</div>
              <div className={`${styles.flowValue} ${styles.flowValuePositive}`}>Ksh {fmt(inflow)}</div>
              <div className={styles.flowBarWrap}>
                <div className={styles.flowBarFill} style={{ width: barWidth(inflow, maxFlow), background: 'var(--accent)' }} />
              </div>
              <p className={styles.flowNote}>Loan repayments, interest, fees, and other receipts</p>
            </div>

            <div className={styles.flowCard}>
              <div className={styles.flowLabel}>Total outflow</div>
              <div className={`${styles.flowValue} ${styles.flowValueNegative}`}>−Ksh {fmt(outflow)}</div>
              <div className={styles.flowBarWrap}>
                <div className={styles.flowBarFill} style={{ width: barWidth(outflow, maxFlow), background: '#ef4444' }} />
              </div>
              <p className={styles.flowNote}>Loan disbursements, operating expenses, and transfers</p>
            </div>
          </div>

          {/* ── Capital movements (deposits + withdrawals) ───────────────── */}
          {(capitalDeposits > 0 || capitalWithdrawals > 0 || pendingWithdrawals > 0) && (
            <div className={styles.panel}>
              <div className={styles.panelRow}>
                <h2 className={styles.panelTitle}>Capital movements</h2>
                <Link to="/stakeholders/capital" className={styles.panelLink}>
                  View all capital transactions →
                </Link>
              </div>
              <p className={styles.panelSubtitle}>
                Approved investor, partner, and owner deposits and withdrawals.
                Pending withdrawals are shown for visibility but not yet applied to the cash position.
              </p>

              <div className={styles.capitalGrid}>
                <div className={styles.capitalCard}>
                  <div className={styles.capitalCardLabel}>Approved deposits</div>
                  <div className={`${styles.capitalCardValue} ${styles.textGreen}`}>
                    + Ksh {fmt(capitalDeposits)}
                  </div>
                  <p className={styles.flowNote}>Capital injected and posted to the general ledger</p>
                </div>
                <div className={styles.capitalCard}>
                  <div className={styles.capitalCardLabel}>Approved withdrawals</div>
                  <div className={`${styles.capitalCardValue} ${styles.textRed}`}>
                    − Ksh {fmt(capitalWithdrawals)}
                  </div>
                  <p className={styles.flowNote}>Capital returned to stakeholders, finance-approved</p>
                </div>
                <div className={`${styles.capitalCard} ${pendingWithdrawals > 0 ? styles.capitalCardPending : ''}`}>
                  <div className={styles.capitalCardLabel}>Pending withdrawals</div>
                  <div className={`${styles.capitalCardValue} ${pendingWithdrawals > 0 ? styles.textAmber : ''}`}>
                    {pendingWithdrawals > 0 ? `Ksh ${fmt(pendingWithdrawals)}` : 'None pending'}
                  </div>
                  <p className={styles.flowNote}>Awaiting finance approval — not yet posted</p>
                </div>
              </div>

              {/* 📊 Capital donut chart */}
              {hasCapitalDonut && (
                <div className={styles.chartRow} style={{ marginTop: 8 }}>
                  <ChartContainer
                    title="Capital allocation"
                    subtitle="Deposits · Withdrawals · Pending"
                    height={200}
                    style={{ flex: 1, minWidth: 220 }}
                  >
                    <DonutChartWrapper
                      data={capitalDonutData}
                      innerRadius={55}
                      outerRadius={80}
                      centerLabel={`Ksh ${fmt(capitalDeposits - capitalWithdrawals)}`}
                      centerSub="net capital"
                      height={200}
                    />
                  </ChartContainer>

                  <div className={styles.chartLegendCard} style={{ flex: 1, minWidth: 180 }}>
                    <p className={styles.chartLegendTitle}>Capital detail</p>
                    {capitalDonutData.map((d) => (
                      <div key={d.name} className={styles.chartLegendRow}>
                        <span className={styles.chartLegendDot} style={{ background: d.color }} />
                        <span className={styles.chartLegendLabel}>{d.name}</span>
                        <span className={styles.chartLegendValue} style={{ color: d.color }}>
                          Ksh {fmt(d.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent approved capital transactions */}
              {capitalTxns.length > 0 && (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Submitted by</th>
                      <th>Branch</th>
                      <th className={styles.tdRight}>Amount</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capitalTxns.map((tx) => (
                      <tr key={tx.id}>
                        <td>{fmtDate(tx.approved_at || tx.created_at)}</td>
                        <td>
                          <span className={`${styles.badge} ${tx.transaction_type === 'deposit' ? styles.badgeDeposit : styles.badgeWithdrawal}`}>
                            {tx.transaction_type}
                          </span>
                        </td>
                        <td>{tx.submitted_by_name ?? `User #${tx.submitted_by_user_id}`}</td>
                        <td>{tx.branch_name ?? 'Org-wide'}</td>
                        <td className={`${styles.tdRight} ${tx.transaction_type === 'deposit' ? styles.textGreen : styles.textRed}`}>
                          {tx.transaction_type === 'withdrawal' ? '−' : '+'}
                          {tx.currency} {fmt(tx.amount)}
                        </td>
                        <td className={styles.muted}>{tx.reference ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Pending withdrawals needing finance action ───────────────── */}
          {pendingTxns.length > 0 && (
            <div className={`${styles.panel} ${styles.pendingPanel}`}>
              <div className={styles.panelRow}>
                <h2 className={styles.panelTitle}>
                  Pending withdrawal requests
                  <span className={styles.pendingBadge}>{pendingTotal}</span>
                </h2>
                <Link to="/stakeholders/capital" className={styles.panelLink}>
                  Review in capital transactions →
                </Link>
              </div>
              <p className={styles.panelSubtitle}>
                Finance must approve or reject these requests. Withdrawals below the net cashflow
                threshold require an override note.
              </p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>By</th>
                    <th>Branch</th>
                    <th className={styles.tdRight}>Amount</th>
                    <th className={styles.tdRight}>Cashflow at submission</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTxns.map((tx) => {
                    const cashNet = Number(tx.cashflow_net_at_submission ?? 0)
                    const amount  = Number(tx.amount)
                    const risky   = cashNet < amount
                    return (
                      <tr key={tx.id}>
                        <td>{fmtDate(tx.created_at)}</td>
                        <td>{tx.submitted_by_name ?? `User #${tx.submitted_by_user_id}`}</td>
                        <td>{tx.branch_name ?? 'Org-wide'}</td>
                        <td className={`${styles.tdRight} ${styles.textAmber}`}>
                          {tx.currency} {fmt(amount)}
                        </td>
                        <td className={`${styles.tdRight} ${risky ? styles.textRed : styles.textGreen}`}>
                          Ksh {fmt(cashNet)}
                          {risky && <span className={styles.riskFlag}> ⚠</span>}
                        </td>
                        <td className={styles.muted}>{tx.note ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Cash flow summary table ──────────────────────────────────── */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Cash flow summary</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className={styles.tdRight}>Amount (Ksh)</th>
                  <th className={styles.tdRight}>Direction</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Operational inflow (repayments)</td>
                  <td className={`${styles.tdRight} ${styles.textGreen}`}>{fmt(inflow)}</td>
                  <td className={styles.tdRight}>↑ Positive</td>
                </tr>
                <tr>
                  <td>Operational outflow (disbursements)</td>
                  <td className={`${styles.tdRight} ${styles.textRed}`}>{fmt(outflow)}</td>
                  <td className={styles.tdRight}>↓ Negative</td>
                </tr>
                {capitalDeposits > 0 && (
                  <tr>
                    <td>Capital deposits (approved)</td>
                    <td className={`${styles.tdRight} ${styles.textGreen}`}>{fmt(capitalDeposits)}</td>
                    <td className={styles.tdRight}>↑ Positive</td>
                  </tr>
                )}
                {capitalWithdrawals > 0 && (
                  <tr>
                    <td>Capital withdrawals (approved)</td>
                    <td className={`${styles.tdRight} ${styles.textRed}`}>{fmt(capitalWithdrawals)}</td>
                    <td className={styles.tdRight}>↓ Negative</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className={styles.totalsRow}>
                  <td><strong>Net cash flow</strong></td>
                  <td className={`${styles.tdRight} ${isPositive ? styles.textGreen : styles.textRed}`}>
                    <strong>{isPositive ? '' : '−'}Ksh {fmt(Math.abs(net))}</strong>
                  </td>
                  <td className={styles.tdRight}>
                    <strong>{isPositive ? 'Surplus' : 'Deficit'}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── GL reconciliation supplement ─────────────────────────────── */}
          {!glCashQuery.isLoading && Object.keys(glData).length > 0 && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>GL reconciliation</h2>
              <p className={styles.panelSubtitle}>
                General ledger cash flow report — cross-reference against treasury position.
              </p>
              <div className={styles.glGrid}>
                {Object.entries(glData)
                  .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
                  .slice(0, 6)
                  .map(([key, value]) => (
                    <div key={key} className={styles.glCard}>
                      <div className={styles.glLabel}>{key.replace(/_/g, ' ')}</div>
                      <div className={styles.glValue}>
                        {typeof value === 'number' ? `Ksh ${fmt(value)}` : String(value)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <p className={styles.footerNote}>
            All figures in Kenyan Shillings (Ksh). Cash flow metrics are cumulative and reflect
            total fund movements synchronised with the general ledger. Capital movements reflect
            only finance-approved transactions.
          </p>
        </>
      )}
    </div>
  )
}
