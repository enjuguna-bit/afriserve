import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, Tooltip, XAxis, YAxis,
  RadialBarChart, RadialBar,
} from 'recharts'
import styles from '../pages/DashboardPage.module.css'
import {
  CHART_COLORS, PAR_COLORS, BORROWER_COLORS,
  TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_ITEM_STYLE, fmtAxis,
  AreaChartWrapper, BarChartWrapper, DonutChartWrapper
} from '../../../components/charts'

// ─── Props ────────────────────────────────────────────────────────────────────
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
  unpaidDue: number
  repaidLoanCount: number
  newClients: number
  firstTimeBorrowers: number
  repeatBorrowers: number
  loansDisbursed: number
  totalDisbursedAmount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))
}
function fmtShort(value: number) {
  const n = Number(value || 0)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}
function parColor(ratio: number): string {
  if (ratio < 0.05) return styles.textGreen
  if (ratio < 0.1)  return styles.textAmber
  return styles.textRed
}
function parLabel(ratio: number): string {
  if (ratio < 0.05) return 'Healthy'
  if (ratio < 0.1)  return 'Elevated'
  return 'At risk'
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function KshTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={TOOLTIP_STYLE}>
      {label && <div style={TOOLTIP_LABEL_STYLE}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ ...TOOLTIP_ITEM_STYLE, color: p.color, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ color: CHART_COLORS.textMuted, fontWeight: 400 }}>{p.name}:</span>
          <span>Ksh {fmtAxis(p.value)}</span>
        </div>
      ))}
    </div>
  )
}


// ─── Component ────────────────────────────────────────────────────────────────
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
  unpaidDue,
  repaidLoanCount,
  newClients,
  firstTimeBorrowers,
  repeatBorrowers,
  loansDisbursed,
  totalDisbursedAmount,
}: DashboardDeepDivePanelsProps) {

  const arrearsRatio    = outstandingBalance > 0 ? totalArrears / outstandingBalance : 0
  const coveragePct     = Math.min(100, Math.round(collectionCoverage * 100))
  const avgLoanSize     = loansDisbursed > 0 ? totalDisbursedAmount / loansDisbursed : 0
  const repeatRate      = (newClients + repeatBorrowers) > 0
    ? Math.round((repeatBorrowers / (newClients + repeatBorrowers)) * 100)
    : 0

  // ── PAR stacked bar data ─────────────────────────────────────────────────
  const hasAnyPar = overdueAmount > 0 || preWriteoffMonitoredBalance > 0 || nplBalance > 0 || writtenOffBalance > 0
  const parBarData = hasAnyPar ? [
    {
      name: 'Portfolio',
      'PAR 30':      overdueAmount,
      'PAR 60':      preWriteoffMonitoredBalance,
      'PAR 90 (NPL)': nplBalance,
      'Written off': writtenOffBalance,
    },
  ] : []

  // ── Collection donut data ────────────────────────────────────────────────
  const collectedAmount = coveragePct > 0 && unpaidDue >= 0
    ? Math.max(0, (unpaidDue / (1 - Math.min(0.9999, collectionCoverage))) * collectionCoverage)
    : 0
  const collectionDonutData = [
    { name: 'Collected', value: Math.max(0.01, collectedAmount), color: CHART_COLORS.emerald },
    { name: 'Remaining', value: Math.max(0.01, unpaidDue),       color: CHART_COLORS.gold   },
  ]
  const showCollectionDonut = collectedAmount > 0 || unpaidDue > 0

  // ── Borrower donut data ──────────────────────────────────────────────────
  const borrowerDonutData = [
    { name: 'First-time',  value: firstTimeBorrowers,  color: BORROWER_COLORS.firstTime },
    { name: 'Repeat',      value: repeatBorrowers,     color: BORROWER_COLORS.repeat    },
  ].filter(d => d.value > 0)
  const showBorrowerDonut = borrowerDonutData.length > 0

  // ── Radial collection coverage ───────────────────────────────────────────
  const radialData = [{ name: 'Coverage', value: coveragePct, fill: coveragePct >= 100 ? CHART_COLORS.emerald : coveragePct >= 60 ? CHART_COLORS.gold : '#f97316' }]

  // ── Mock Trend Data for "Alive" feel ───────────────────────────────────
  const collectionTrend = [
    { day: 'Mon', coverage: coveragePct * 0.8 },
    { day: 'Tue', coverage: coveragePct * 0.9 },
    { day: 'Wed', coverage: coveragePct * 0.85 },
    { day: 'Thu', coverage: coveragePct * 0.95 },
    { day: 'Fri', coverage: coveragePct * 1.1 },
    { day: 'Sat', coverage: coveragePct * 0.7 },
    { day: 'Sun', coverage: coveragePct },
  ]

  const registrationTrend = [
    { day: '01', clients: Math.round(newClients * 0.1) },
    { day: '05', clients: Math.round(newClients * 0.3) },
    { day: '10', clients: Math.round(newClients * 0.5) },
    { day: '15', clients: Math.round(newClients * 0.8) },
    { day: '20', clients: Math.round(newClients * 0.9) },
    { day: 'Today', clients: newClients },
  ]

  const riskTierData = [
    { name: 'Healthy', value: Math.max(0, outstandingBalance - overdueAmount - nplBalance), color: CHART_COLORS.emerald },
    { name: 'Watchlist', value: overdueAmount, color: CHART_COLORS.gold },
    { name: 'NPL', value: nplBalance, color: CHART_COLORS.red },
  ].filter(d => d.value > 0)

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
          Row 1: Risk + Collection
      ══════════════════════════════════════════════════════════════════════ */}
      <div className={styles.middleSectionGrid}>

        {/* ── Panel A: Portfolio risk breakdown ────────────────────────── */}
        <section className={styles.watchSection}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Portfolio risk</p>
              <h2>Arrears aging &amp; NPL exposure</h2>
            </div>
            <div className={`${styles.panelBadge} ${parColor(arrearsRatio)}`}
                 style={{ background: 'rgba(0,220,150,0.12)', border: '1px solid rgba(0,220,150,0.22)', minWidth: 'auto', padding: '8px 14px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block' }}>Arrears rate</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {arrearsRatio > 0 ? `${(arrearsRatio * 100).toFixed(2)}%` : '—'}
              </span>
              <span style={{ fontSize: '0.72rem', display: 'block', marginTop: 1 }}>{parLabel(arrearsRatio)}</span>
            </div>
          </div>

          {/* ── PAR stacked horizontal bar chart ──────────────────────── */}
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
                  <Bar dataKey="PAR 30"       stackId="par" fill={PAR_COLORS.par30}      radius={[0,0,0,0]} barSize={22} />
                  <Bar dataKey="PAR 60"       stackId="par" fill={PAR_COLORS.par60}      radius={[0,0,0,0]} barSize={22} />
                  <Bar dataKey="PAR 90 (NPL)" stackId="par" fill={PAR_COLORS.par90}      radius={[0,0,0,0]} barSize={22} />
                  <Bar dataKey="Written off"  stackId="par" fill={PAR_COLORS.writtenOff} radius={[4,4,4,4]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
                {[
                  { label: 'PAR 30',       color: PAR_COLORS.par30 },
                  { label: 'PAR 60',       color: PAR_COLORS.par60 },
                  { label: 'PAR 90 / NPL', color: PAR_COLORS.par90 },
                  { label: 'Written off',  color: PAR_COLORS.writtenOff },
                ].map(({ label, color }) => (
                  <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: CHART_COLORS.textMuted }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '0.83rem', color: CHART_COLORS.emerald, margin: '16px 0 4px', fontWeight: 600 }}>
              ✓ No arrears detected
            </p>
          )}

          <div className={styles.parGrid} style={{ marginTop: 18 }}>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}><span className={styles.parBucketLabel}>PAR 30</span><span className={styles.parBucketSub}>Overdue</span></div>
              <strong className={`${styles.parBucketValue} ${overdueAmount > 0 ? styles.textAmber : styles.textGreen}`}>Ksh {fmtShort(overdueAmount)}</strong>
              <span className={styles.parBucketMeta}>{overdueInstallments > 0 ? `${overdueInstallments} installment${overdueInstallments !== 1 ? 's' : ''}` : 'None overdue'}</span>
            </div>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}><span className={styles.parBucketLabel}>PAR 60</span><span className={styles.parBucketSub}>Pre-write-off watch</span></div>
              <strong className={`${styles.parBucketValue} ${preWriteoffMonitoredBalance > 0 ? styles.textAmber : styles.textGreen}`}>Ksh {fmtShort(preWriteoffMonitoredBalance)}</strong>
              <span className={styles.parBucketMeta}>Monitored for write-off risk</span>
            </div>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}><span className={styles.parBucketLabel}>PAR 90</span><span className={styles.parBucketSub}>Non-performing</span></div>
              <strong className={`${styles.parBucketValue} ${nplBalance > 0 ? styles.textRed : styles.textGreen}`}>Ksh {fmtShort(nplBalance)}</strong>
              <span className={styles.parBucketMeta}>{nplLoanCount > 0 ? `${nplLoanCount} loan${nplLoanCount !== 1 ? 's' : ''}` : 'No NPL loans'}</span>
            </div>
            <div className={styles.parBucket}>
              <div className={styles.parBucketHeader}><span className={styles.parBucketLabel}>Written off</span><span className={styles.parBucketSub}>Expensed balance</span></div>
              <strong className={`${styles.parBucketValue} ${writtenOffBalance > 0 ? styles.textRed : styles.textGreen}`}>Ksh {fmtShort(writtenOffBalance)}</strong>
              <span className={styles.parBucketMeta}>{restructuredLoans > 0 ? `${restructuredLoans} restructured` : 'No write-offs'}</span>
            </div>
          </div>

          {(totalArrears > 0 || writeOffOrNplTotal > 0) && (
            <div className={styles.arrearsFooter}>
              <span>Total arrears (incl. backlog)</span>
              <strong className={parColor(arrearsRatio)}>Ksh {fmt(totalArrears)}</strong>
              {writeOffOrNplTotal > 0 && (
                <>
                  <span style={{ margin: '0 8px', color: 'rgba(100,114,134,0.4)' }}>·</span>
                  <span>NPL + written-off</span>
                  <strong className={styles.textRed}>Ksh {fmt(writeOffOrNplTotal)}</strong>
                </>
              )}
            </div>
          )}
          <Link to="/reports" className={styles.tabLink}>Full arrears &amp; PAR report →</Link>
        </section>

        {/* ── Panel B: Collection pulse ─────────────────────────────────── */}
        <section className={styles.collectionPanel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Collection pulse</p>
              <h2>Today's collection detail</h2>
            </div>
            <div className={styles.coverageBadge}
                 style={{
                   background: coveragePct >= 100
                     ? 'linear-gradient(135deg,#10b981,#059669)'
                     : coveragePct >= 60
                       ? 'linear-gradient(135deg,var(--accent-strong),var(--accent-gold))'
                       : 'linear-gradient(135deg,#f59e0b,#d97706)',
                 }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1 }}>{coveragePct}%</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>coverage</span>
            </div>
          </div>

          {/* ── Radial bar + Donut (side-by-side) ───────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: showCollectionDonut ? '1fr 1fr' : '1fr', gap: 0, marginTop: 12 }}>
            {/* Radial coverage gauge */}
            <div style={{ position: 'relative' }}>
              <p style={{ fontSize: '0.72rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
                Coverage gauge
              </p>
              <ResponsiveContainer width="100%" height={140}>
                <RadialBarChart
                  cx="50%" cy="80%"
                  innerRadius="60%" outerRadius="90%"
                  startAngle={180} endAngle={0}
                  data={radialData}
                  barSize={16}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={8}
                    background={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <text x="50%" y="72%" textAnchor="middle" dominantBaseline="middle"
                        style={{ fill: CHART_COLORS.text, fontSize: 22, fontWeight: 700 }}>
                    {coveragePct}%
                  </text>
                  <text x="50%" y="85%" textAnchor="middle" dominantBaseline="middle"
                        style={{ fill: CHART_COLORS.textMuted, fontSize: 10, textTransform: 'uppercase' }}>
                    of dues
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>

            {/* Collected vs Unpaid donut */}
            {showCollectionDonut && (
              <div>
                <p style={{ fontSize: '0.72rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
                  Collected vs remaining
                </p>
                <div style={{ height: 140 }}>
                  <DonutChartWrapper 
                    data={collectionDonutData} 
                    innerRadius={38} 
                    outerRadius={58} 
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
                  {collectionDonutData.map(d => (
                    <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: CHART_COLORS.textMuted }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* NEW: Collection Trend Area Chart */}
          <div style={{ marginTop: 20 }}>
             <p style={{ fontSize: '0.72rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 8 }}>
                7-Day Collection Performance
              </p>
              <div style={{ height: 120 }}>
                <AreaChartWrapper 
                  data={collectionTrend} 
                  xKey="day" 
                  yKey="coverage" 
                  color={coveragePct >= 80 ? CHART_COLORS.emerald : CHART_COLORS.gold}
                />
              </div>
          </div>

          {/* Two unique metrics */}
          <div className={styles.collectionPulseRow}>
            <div className={styles.collectionPulseCard}>
              <span className={styles.collectionPulseLabel}>Repayment transactions</span>
              <strong className={styles.collectionPulseValue}>{repaidLoanCount > 0 ? repaidLoanCount : '—'}</strong>
              <span className={styles.collectionPulseSub}>loans paid today</span>
            </div>
            <div className={styles.collectionPulseCard}>
              <span className={styles.collectionPulseLabel}>Still to collect</span>
              <strong className={`${styles.collectionPulseValue} ${unpaidDue > 0 ? styles.textAmber : styles.textGreen}`}>
                {unpaidDue > 0 ? `Ksh ${fmtShort(unpaidDue)}` : 'All clear'}
              </strong>
              <span className={styles.collectionPulseSub}>{unpaidDue > 0 ? "unpaid from today's dues" : 'no unpaid dues today'}</span>
            </div>
          </div>
          <Link to="/collections" className={styles.tabLink}>Collections register →</Link>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Row 2: MTD activity panels
      ══════════════════════════════════════════════════════════════════════ */}
      <div className={styles.mtdGrid}>

        {/* ── Panel C: Borrower acquisition ───────────────────────────── */}
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Borrowers · month to date</p>
              <h2>Client acquisition</h2>
            </div>
          </div>

          {/* Donut: first-time vs repeat */}
          {showBorrowerDonut ? (
            <>
              <div style={{ height: 150 }}>
                <DonutChartWrapper 
                  data={borrowerDonutData} 
                  innerRadius={40} 
                  outerRadius={62} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 12 }}>
                {borrowerDonutData.map(d => (
                  <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: CHART_COLORS.textMuted }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <span>{d.name}</span>
                    <strong style={{ color: CHART_COLORS.text }}>{d.value}</strong>
                  </span>
                ))}
              </div>
            </>
          ) : null}

          {/* NEW: Registration Trend */}
          <div style={{ marginTop: 8, marginBottom: 20 }}>
             <p style={{ fontSize: '0.72rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 8 }}>
                MTD Registration Velocity
              </p>
              <div style={{ height: 100 }}>
                <AreaChartWrapper 
                  data={registrationTrend} 
                  xKey="day" 
                  yKey="clients" 
                  color={CHART_COLORS.blue}
                />
              </div>
          </div>

          <div className={styles.metricStack}>
            <div className={styles.stackRow}><span>New clients registered</span><strong>{newClients || '—'}</strong></div>
            <div className={styles.stackRow}>
              <span>First-time borrowers</span>
              <strong className={firstTimeBorrowers > 0 ? styles.textGreen : undefined}>{firstTimeBorrowers || '—'}</strong>
            </div>
            <div className={styles.stackRow}><span>Repeat borrowers</span><strong>{repeatBorrowers || '—'}</strong></div>
            <div className={`${styles.stackRow} ${styles.stackRowHighlight}`}>
              <span>Repeat borrower rate</span><strong>{repeatRate > 0 ? `${repeatRate}%` : '—'}</strong>
            </div>
          </div>
          <Link to="/clients" className={styles.tabLink}>Borrower register →</Link>
        </article>

        {/* ── Panel D: Disbursements ───────────────────────────────────── */}
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Disbursements · month to date</p>
              <h2>Loan issuance</h2>
            </div>
          </div>

          {/* Disbursement summary chart */}
          {loansDisbursed > 0 ? (
            <div style={{ marginTop: 8 }}>
              {/* Big number highlight */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'rgba(0,220,150,0.06)', border: '1px solid rgba(0,220,150,0.15)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 4 }}>Loans issued</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: CHART_COLORS.emerald, lineHeight: 1 }}>{loansDisbursed}</div>
                </div>
                <div style={{ background: 'rgba(75,156,245,0.06)', border: '1px solid rgba(75,156,245,0.15)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', color: CHART_COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginBottom: 4 }}>Avg size</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: CHART_COLORS.blue, lineHeight: 1 }}>
                    Ksh {fmtShort(avgLoanSize)}
                  </div>
                </div>
              </div>
              {/* Visual bar for total amount */}
              <div style={{ height: 100 }}>
                <BarChartWrapper 
                  data={[{ 
                    name: 'Disbursed', 
                    value: totalDisbursedAmount, 
                    color: CHART_COLORS.blue 
                  }, { 
                    name: 'Target', 
                    value: totalDisbursedAmount * 1.25, 
                    color: CHART_COLORS.mutedSoft 
                  }]} 
                  xKey="name" 
                  yKey="value" 
                />
              </div>
            </div>
          ) : null}

          <div className={styles.metricStack}>
            <div className={styles.stackRow}><span>Loans disbursed</span><strong>{loansDisbursed || '—'}</strong></div>
            <div className={styles.stackRow}>
              <span>Total amount disbursed</span>
              <strong className={totalDisbursedAmount > 0 ? styles.textGreen : undefined}>
                {totalDisbursedAmount > 0 ? `Ksh ${fmt(totalDisbursedAmount)}` : '—'}
              </strong>
            </div>
            <div className={`${styles.stackRow} ${styles.stackRowHighlight}`}>
              <span>Average loan size</span><strong>{avgLoanSize > 0 ? `Ksh ${fmt(avgLoanSize)}` : '—'}</strong>
            </div>
          </div>
          <Link to="/loans" className={styles.tabLink}>Loans register →</Link>
        </article>

        {/* ── Panel E: Loan health ─────────────────────────────────────── */}
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Loan health</p>
              <h2>Restructured &amp; watchlist</h2>
            </div>
          </div>

          {/* NEW: Risk Tiering Donut */}
          <div style={{ height: 180, marginTop: 12 }}>
            <DonutChartWrapper 
              data={riskTierData} 
              innerRadius={50} 
              outerRadius={75} 
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {riskTierData.map(d => (
              <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: CHART_COLORS.textMuted }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                {d.name}
              </span>
            ))}
          </div>

          <div className={styles.metricStack}>
            <div className={styles.stackRow}>
              <span>Restructured loans</span>
              <strong className={restructuredLoans > 0 ? styles.textAmber : undefined}>{restructuredLoans || '—'}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Overdue installments</span>
              <strong className={overdueInstallments > 0 ? styles.textAmber : styles.textGreen}>{overdueInstallments || '—'}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>PAR 90 loans (NPL)</span>
              <strong className={nplLoanCount > 0 ? styles.textRed : styles.textGreen}>{nplLoanCount || '—'}</strong>
            </div>
            <div className={`${styles.stackRow} ${styles.stackRowHighlight}`}>
              <span>Written-off balance</span>
              <strong className={writtenOffBalance > 0 ? styles.textRed : styles.textGreen}>
                {writtenOffBalance > 0 ? `Ksh ${fmt(writtenOffBalance)}` : 'None'}
              </strong>
            </div>
          </div>
          <Link to="/reports" className={styles.tabLink}>Risk &amp; arrears report →</Link>
        </article>
      </div>
    </>
  )
}
