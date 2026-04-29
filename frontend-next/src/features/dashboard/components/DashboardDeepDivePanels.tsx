import { Link } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis, YAxis } from 'recharts'
import styles from '../pages/DashboardPage.module.css'
import {
  CHART_COLORS,
  PAR_COLORS,
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  fmtAxis,
} from '../../../components/charts'

type DashboardDeepDivePanelsProps = {
  outstandingBalance: number
  totalArrears: number
  preWriteoffMonitoredBalance: number
  nplBalance: number
  nplLoanCount: number
  writtenOffBalance: number
  writeOffOrNplTotal: number
  overdueAmount: number
  overdueInstallments: number
  restructuredLoans: number
  collectionCoverage: number
  collectionsToday: number
  scheduledDueToday: number
  scheduledDueStillUnpaid: number
  repaidLoanCount: number
  newClients: number
  firstTimeBorrowers: number
  repeatBorrowers: number
  loansDisbursed: number
  totalDisbursedAmount: number
}

function fmt(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function fmtShort(value: number) {
  const n = Number(value || 0)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function parColor(ratio: number): string {
  if (ratio < 0.05) return styles.textGreen
  if (ratio < 0.1) return styles.textAmber
  return styles.textRed
}

function parLabel(ratio: number): string {
  if (ratio < 0.05) return 'Healthy'
  if (ratio < 0.1) return 'Elevated'
  return 'At risk'
}

function KshTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null

  return (
    <div style={TOOLTIP_STYLE}>
      {label ? <div style={TOOLTIP_LABEL_STYLE}>{label}</div> : null}
      {payload.map((entry) => (
        <div key={entry.name} style={{ ...TOOLTIP_ITEM_STYLE, color: entry.color, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: CHART_COLORS.textMuted, fontWeight: 400 }}>{entry.name}:</span>
          <span>Ksh {fmtAxis(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function DashboardDeepDivePanels({
  outstandingBalance,
  totalArrears,
  preWriteoffMonitoredBalance,
  nplBalance,
  nplLoanCount,
  writtenOffBalance,
  writeOffOrNplTotal,
  overdueAmount,
  overdueInstallments,
  restructuredLoans,
  collectionCoverage,
  collectionsToday,
  scheduledDueToday,
  scheduledDueStillUnpaid,
  repaidLoanCount,
  newClients,
  firstTimeBorrowers,
  repeatBorrowers,
  loansDisbursed,
  totalDisbursedAmount,
}: DashboardDeepDivePanelsProps) {
  const arrearsRatio = outstandingBalance > 0 ? totalArrears / outstandingBalance : 0
  const coveragePct = Math.max(0, Math.min(100, Math.round(collectionCoverage * 100)))
  const avgLoanSize = loansDisbursed > 0 ? totalDisbursedAmount / loansDisbursed : 0
  const repeatRate = (firstTimeBorrowers + repeatBorrowers) > 0
    ? Math.round((repeatBorrowers / (firstTimeBorrowers + repeatBorrowers)) * 100)
    : 0
  const collectionStatus = coveragePct >= 100
    ? 'On target'
    : coveragePct >= 60
      ? 'In progress'
      : 'Needs attention'
  const collectionStatusClass = coveragePct >= 100
    ? styles.textGreen
    : coveragePct >= 60
      ? styles.textAmber
      : styles.textRed

  const hasAnyPar = overdueAmount > 0 || preWriteoffMonitoredBalance > 0 || nplBalance > 0 || writtenOffBalance > 0
  const parBarData = hasAnyPar ? [
    {
      name: 'Portfolio',
      'PAR 30': overdueAmount,
      'PAR 60': preWriteoffMonitoredBalance,
      'PAR 90 (NPL)': nplBalance,
      'Written off': writtenOffBalance,
    },
  ] : []

  return (
    <>
      <div className={styles.middleSectionGrid}>
        <section className={styles.watchSection}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Portfolio risk</p>
              <h2>Arrears aging &amp; NPL exposure</h2>
            </div>
            <div className={styles.panelBadge}>
              <span>{arrearsRatio > 0 ? `${(arrearsRatio * 100).toFixed(2)}%` : '0.00%'}</span>
              <small>{parLabel(arrearsRatio)}</small>
            </div>
          </div>

          {hasAnyPar ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: '0.72rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 8 }}>
                Risk bucket distribution
              </p>
              <ResponsiveContainer width="100%" height={64}>
                <BarChart data={parBarData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide tickFormatter={fmtAxis} />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip content={<KshTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="PAR 30" stackId="par" fill={PAR_COLORS.par30} radius={[0, 0, 0, 0]} barSize={18} />
                  <Bar dataKey="PAR 60" stackId="par" fill={PAR_COLORS.par60} radius={[0, 0, 0, 0]} barSize={18} />
                  <Bar dataKey="PAR 90 (NPL)" stackId="par" fill={PAR_COLORS.par90} radius={[0, 0, 0, 0]} barSize={18} />
                  <Bar dataKey="Written off" stackId="par" fill={PAR_COLORS.writtenOff} radius={[4, 4, 4, 4]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className={styles.muted}>No arrears or written-off balances are showing in the current scope.</p>
          )}

          <div className={styles.parGrid}>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}>
                <span className={styles.parBucketLabel}>PAR 30</span>
                <span className={styles.parBucketSub}>Overdue</span>
              </div>
              <strong className={`${styles.parBucketValue} ${overdueAmount > 0 ? styles.textAmber : styles.textGreen}`}>Ksh {fmtShort(overdueAmount)}</strong>
              <span className={styles.parBucketMeta}>{overdueInstallments > 0 ? `${overdueInstallments} installment${overdueInstallments !== 1 ? 's' : ''}` : 'None overdue'}</span>
            </div>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}>
                <span className={styles.parBucketLabel}>PAR 60</span>
                <span className={styles.parBucketSub}>Watchlist</span>
              </div>
              <strong className={`${styles.parBucketValue} ${preWriteoffMonitoredBalance > 0 ? styles.textAmber : styles.textGreen}`}>Ksh {fmtShort(preWriteoffMonitoredBalance)}</strong>
              <span className={styles.parBucketMeta}>Accounts approaching write-off review</span>
            </div>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}>
                <span className={styles.parBucketLabel}>PAR 90</span>
                <span className={styles.parBucketSub}>Non-performing</span>
              </div>
              <strong className={`${styles.parBucketValue} ${nplBalance > 0 ? styles.textRed : styles.textGreen}`}>Ksh {fmtShort(nplBalance)}</strong>
              <span className={styles.parBucketMeta}>{nplLoanCount > 0 ? `${nplLoanCount} loan${nplLoanCount !== 1 ? 's' : ''}` : 'No NPL loans'}</span>
            </div>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}>
                <span className={styles.parBucketLabel}>Written off</span>
                <span className={styles.parBucketSub}>Expensed balance</span>
              </div>
              <strong className={`${styles.parBucketValue} ${writtenOffBalance > 0 ? styles.textRed : styles.textGreen}`}>Ksh {fmtShort(writtenOffBalance)}</strong>
              <span className={styles.parBucketMeta}>{restructuredLoans > 0 ? `${restructuredLoans} restructured loan${restructuredLoans !== 1 ? 's' : ''}` : 'No write-offs'}</span>
            </div>
          </div>

          {(totalArrears > 0 || writeOffOrNplTotal > 0) ? (
            <div className={styles.arrearsFooter}>
              <span>Total arrears</span>
              <strong className={parColor(arrearsRatio)}>Ksh {fmt(totalArrears)}</strong>
              {writeOffOrNplTotal > 0 ? (
                <>
                  <span style={{ color: 'rgba(100,114,134,0.4)' }}>|</span>
                  <span>NPL + written off</span>
                  <strong className={styles.textRed}>Ksh {fmt(writeOffOrNplTotal)}</strong>
                </>
              ) : null}
            </div>
          ) : null}

          <Link to="/reports" className={styles.tabLink}>View arrears report</Link>
        </section>

        <section className={styles.collectionPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Collections</p>
              <h2>Today&apos;s collection summary</h2>
            </div>
            <div className={styles.panelBadge}>
              <span>{coveragePct}%</span>
              <small>coverage</small>
            </div>
          </div>

          <div className={styles.progressRailLabelled}>
            <span className={styles.progressRailLabel}>Collection coverage</span>
            <span className={`${styles.progressRailPct} ${collectionStatusClass}`}>{collectionStatus}</span>
          </div>
          <div className={styles.progressRailThick}>
            <div className={styles.progressFillThick} style={{ width: `${coveragePct}%` }} />
          </div>

          <div className={styles.collectionGrid}>
            <div className={styles.collectionMetric}>
              <span>Collections due today</span>
              <strong>{scheduledDueToday > 0 ? `Ksh ${fmt(scheduledDueToday)}` : 'No dues today'}</strong>
            </div>
            <div className={styles.collectionMetric}>
              <span>Collected today</span>
              <strong>Ksh {fmt(collectionsToday)}</strong>
            </div>
            <div className={styles.collectionMetric}>
              <span>Unpaid dues</span>
              <strong className={scheduledDueStillUnpaid > 0 ? styles.textAmber : styles.textGreen}>{scheduledDueStillUnpaid > 0 ? `Ksh ${fmt(scheduledDueStillUnpaid)}` : 'All clear'}</strong>
            </div>
            <div className={styles.collectionMetric}>
              <span>Repayment transactions</span>
              <strong>{repaidLoanCount}</strong>
            </div>
          </div>

          <Link to="/collections" className={styles.tabLink}>Open collections register</Link>
        </section>
      </div>

      <div className={styles.mtdGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Borrowers</p>
              <h2>Month-to-date borrower mix</h2>
            </div>
          </div>

          <p className={styles.muted}>This view keeps acquisition simple: new registrations, first-time borrowers, and how much lending is coming from repeat clients.</p>

          <div className={styles.metricStack}>
            <div className={styles.stackRow}>
              <span>New clients registered</span>
              <strong>{newClients || 0}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>First-time borrowers</span>
              <strong className={firstTimeBorrowers > 0 ? styles.textGreen : undefined}>{firstTimeBorrowers || 0}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Repeat borrowers</span>
              <strong>{repeatBorrowers || 0}</strong>
            </div>
            <div className={`${styles.stackRow} ${styles.stackRowHighlight}`}>
              <span>Repeat borrower rate</span>
              <strong>{repeatRate > 0 ? `${repeatRate}%` : '0%'}</strong>
            </div>
          </div>

          <Link to="/clients" className={styles.tabLink}>Open borrower register</Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Disbursements</p>
              <h2>Month-to-date issuance</h2>
            </div>
          </div>

          <p className={styles.muted}>Loan issuance is easier to scan here as a short summary instead of another chart.</p>

          <div className={styles.metricStack}>
            <div className={styles.stackRow}>
              <span>Loans disbursed</span>
              <strong>{loansDisbursed || 0}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Total amount disbursed</span>
              <strong className={totalDisbursedAmount > 0 ? styles.textGreen : undefined}>{totalDisbursedAmount > 0 ? `Ksh ${fmt(totalDisbursedAmount)}` : 'Ksh 0.00'}</strong>
            </div>
            <div className={`${styles.stackRow} ${styles.stackRowHighlight}`}>
              <span>Average loan size</span>
              <strong>{avgLoanSize > 0 ? `Ksh ${fmt(avgLoanSize)}` : 'Ksh 0.00'}</strong>
            </div>
          </div>

          <Link to="/loans" className={styles.tabLink}>Open loans register</Link>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Loan health</p>
              <h2>Watchlist &amp; restructuring</h2>
            </div>
          </div>

          <p className={styles.muted}>This section keeps the follow-up items visible without adding another decorative chart.</p>

          <div className={styles.metricStack}>
            <div className={styles.stackRow}>
              <span>Restructured loans</span>
              <strong className={restructuredLoans > 0 ? styles.textAmber : undefined}>{restructuredLoans || 0}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Overdue installments</span>
              <strong className={overdueInstallments > 0 ? styles.textAmber : styles.textGreen}>{overdueInstallments || 0}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>PAR 90 loans</span>
              <strong className={nplLoanCount > 0 ? styles.textRed : styles.textGreen}>{nplLoanCount || 0}</strong>
            </div>
            <div className={`${styles.stackRow} ${styles.stackRowHighlight}`}>
              <span>Written-off balance</span>
              <strong className={writtenOffBalance > 0 ? styles.textRed : styles.textGreen}>{writtenOffBalance > 0 ? `Ksh ${fmt(writtenOffBalance)}` : 'None'}</strong>
            </div>
          </div>

          <Link to="/reports" className={styles.tabLink}>Open risk report</Link>
        </article>
      </div>
    </>
  )
}

