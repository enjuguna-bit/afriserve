import { ResponsiveContainer, BarChart, Bar, Tooltip, XAxis, YAxis } from 'recharts'
import styles from '../pages/DashboardPage.module.css'
import { DashboardMetricCard, type DashboardMetricShortcutConfig } from './DashboardMetricCard'
import {
  CHART_COLORS,
  PAR_COLORS,
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  fmtAxis,
} from '../../../components/charts'

type DashboardScaffoldPanelsProps = {
  totalArrears: number
  par30Balance: number
  par30Ratio: number
  par60Balance: number
  par60Ratio: number
  par90Balance: number
  par90Ratio: number
  portfolioAtRiskRatio: number
  nplBalance: number
  nplRatio: number
  nplLoanCount: number
  writtenOffBalance: number
  writeOffOrNplTotal: number
  overdueInstallments: number
  collectionCoverage: number
  collectionsToday: number
  scheduledDueToday: number
  scheduledDueStillUnpaid: number
  repaidLoanCount: number
  shortcutTargets: {
    par30: DashboardMetricShortcutConfig
    par60: DashboardMetricShortcutConfig
    par90: DashboardMetricShortcutConfig
    npl: DashboardMetricShortcutConfig
    totalArrears: DashboardMetricShortcutConfig
    overdueInstallments: DashboardMetricShortcutConfig
    nplLoans: DashboardMetricShortcutConfig
    nplAndWrittenOff: DashboardMetricShortcutConfig
    collectionsDueToday: DashboardMetricShortcutConfig
    collectionsToday: DashboardMetricShortcutConfig
    unpaidDues: DashboardMetricShortcutConfig
    repayments: DashboardMetricShortcutConfig
  }
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

export function DashboardScaffoldPanels({
  totalArrears,
  par30Balance,
  par30Ratio,
  par60Balance,
  par60Ratio,
  par90Balance,
  par90Ratio,
  portfolioAtRiskRatio,
  nplBalance,
  nplRatio,
  nplLoanCount,
  writtenOffBalance,
  writeOffOrNplTotal,
  overdueInstallments,
  collectionCoverage,
  collectionsToday,
  scheduledDueToday,
  scheduledDueStillUnpaid,
  repaidLoanCount,
  shortcutTargets,
}: DashboardScaffoldPanelsProps) {
  const coveragePct = Math.max(0, Math.min(100, Math.round(collectionCoverage * 100)))
  const coverageClass = coveragePct >= 100
    ? styles.textGreen
    : coveragePct >= 60
      ? styles.textAmber
      : styles.textRed

  const hasAnyPar = par30Balance > 0 || par60Balance > 0 || par90Balance > 0 || nplBalance > 0 || writtenOffBalance > 0
  const parBarData = [
    {
      name: 'Portfolio',
      'PAR 30': par30Balance,
      'PAR 60': par60Balance,
      'PAR 90': par90Balance,
      NPL: nplBalance,
      'Written off': writtenOffBalance,
    },
  ]

  return (
    <div className={styles.middleSectionGrid}>
      <section className={styles.watchSection}>
        <div className={styles.scaffoldHeader}>
          <h2>Portfolio Risk</h2>
          <div className={styles.panelBadge}>
            <span>{portfolioAtRiskRatio > 0 ? `${(portfolioAtRiskRatio * 100).toFixed(2)}%` : '0.00%'}</span>
            <small>PAR ratio</small>
          </div>
        </div>

        {hasAnyPar ? (
          <div className={styles.riskChartWrap}>
            <ResponsiveContainer width="100%" height={72}>
              <BarChart data={parBarData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" hide tickFormatter={fmtAxis} />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip content={<KshTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="PAR 30" stackId="par" fill={PAR_COLORS.par30} radius={[0, 0, 0, 0]} barSize={20} />
                <Bar dataKey="PAR 60" stackId="par" fill={PAR_COLORS.par60} radius={[0, 0, 0, 0]} barSize={20} />
                <Bar dataKey="PAR 90" stackId="par" fill={PAR_COLORS.par90} radius={[0, 0, 0, 0]} barSize={20} />
                <Bar dataKey="NPL" stackId="par" fill={PAR_COLORS.npl} radius={[0, 0, 0, 0]} barSize={20} />
                <Bar dataKey="Written off" stackId="par" fill={PAR_COLORS.writtenOff} radius={[4, 4, 4, 4]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <div className={styles.parGrid}>
          <DashboardMetricCard
            className={`${styles.parBucket} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.par30.destinationRoute}
            filterParams={shortcutTargets.par30.filterParams}
            ariaLabel={shortcutTargets.par30.ariaLabel}
          >
            <div className={styles.parBucketHeader}>
              <span className={styles.parBucketLabel}>PAR 30</span>
              <span className={styles.parBucketSub}>1-30 days</span>
            </div>
            <strong className={`${styles.parBucketValue} ${parColor(par30Ratio)}`}>{(par30Ratio * 100).toFixed(2)}%</strong>
            <div className={styles.parBucketMeta}>Ksh {fmtShort(par30Balance)}</div>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.parBucket} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.par60.destinationRoute}
            filterParams={shortcutTargets.par60.filterParams}
            ariaLabel={shortcutTargets.par60.ariaLabel}
          >
            <div className={styles.parBucketHeader}>
              <span className={styles.parBucketLabel}>PAR 60</span>
              <span className={styles.parBucketSub}>31-60 days</span>
            </div>
            <strong className={`${styles.parBucketValue} ${parColor(par60Ratio)}`}>{(par60Ratio * 100).toFixed(2)}%</strong>
            <div className={styles.parBucketMeta}>Ksh {fmtShort(par60Balance)}</div>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.parBucket} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.par90.destinationRoute}
            filterParams={shortcutTargets.par90.filterParams}
            ariaLabel={shortcutTargets.par90.ariaLabel}
          >
            <div className={styles.parBucketHeader}>
              <span className={styles.parBucketLabel}>PAR 90</span>
              <span className={styles.parBucketSub}>61-90 days</span>
            </div>
            <strong className={`${styles.parBucketValue} ${parColor(par90Ratio)}`}>{(par90Ratio * 100).toFixed(2)}%</strong>
            <div className={styles.parBucketMeta}>Ksh {fmtShort(par90Balance)}</div>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.parBucket} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.npl.destinationRoute}
            filterParams={shortcutTargets.npl.filterParams}
            ariaLabel={shortcutTargets.npl.ariaLabel}
          >
            <div className={styles.parBucketHeader}>
              <span className={styles.parBucketLabel}>NPL</span>
              <span className={styles.parBucketSub}>91+ days</span>
            </div>
            <strong className={`${styles.parBucketValue} ${nplRatio > 0 ? styles.textRed : styles.textGreen}`}>{(nplRatio * 100).toFixed(2)}%</strong>
            <div className={styles.parBucketMeta}>Ksh {fmtShort(nplBalance)}</div>
          </DashboardMetricCard>
        </div>

        <div className={styles.summaryGrid}>
          <DashboardMetricCard
            className={`${styles.summaryMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.totalArrears.destinationRoute}
            filterParams={shortcutTargets.totalArrears.filterParams}
            ariaLabel={shortcutTargets.totalArrears.ariaLabel}
          >
            <span>Total arrears</span>
            <strong className={parColor(portfolioAtRiskRatio)}>Ksh {fmt(totalArrears)}</strong>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.summaryMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.overdueInstallments.destinationRoute}
            filterParams={shortcutTargets.overdueInstallments.filterParams}
            ariaLabel={shortcutTargets.overdueInstallments.ariaLabel}
          >
            <span>Overdue installments</span>
            <strong>{overdueInstallments}</strong>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.summaryMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.nplLoans.destinationRoute}
            filterParams={shortcutTargets.nplLoans.filterParams}
            ariaLabel={shortcutTargets.nplLoans.ariaLabel}
          >
            <span>NPL loans</span>
            <strong className={nplLoanCount > 0 ? styles.textRed : styles.textGreen}>{nplLoanCount}</strong>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.summaryMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.nplAndWrittenOff.destinationRoute}
            filterParams={shortcutTargets.nplAndWrittenOff.filterParams}
            ariaLabel={shortcutTargets.nplAndWrittenOff.ariaLabel}
          >
            <span>NPL + written off</span>
            <strong className={writeOffOrNplTotal > 0 ? styles.textRed : styles.textGreen}>Ksh {fmt(writeOffOrNplTotal)}</strong>
          </DashboardMetricCard>
        </div>
      </section>

      <section className={styles.collectionPanel}>
        <div className={styles.scaffoldHeader}>
          <h2>Collections</h2>
          <div className={styles.panelBadge}>
            <span>{coveragePct}%</span>
            <small>coverage</small>
          </div>
        </div>

        <div className={styles.progressRailLabelled}>
          <span className={styles.progressRailLabel}>Collected vs scheduled dues</span>
          <span className={`${styles.progressRailPct} ${coverageClass}`}>{coveragePct}%</span>
        </div>
        <div className={styles.progressRailThick}>
          <div className={styles.progressFillThick} style={{ width: `${coveragePct}%` }} />
        </div>

        <div className={styles.collectionGrid}>
          <DashboardMetricCard
            className={`${styles.collectionMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.collectionsDueToday.destinationRoute}
            filterParams={shortcutTargets.collectionsDueToday.filterParams}
            ariaLabel={shortcutTargets.collectionsDueToday.ariaLabel}
          >
            <span>Collections due today</span>
            <strong>Ksh {fmt(scheduledDueToday)}</strong>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.collectionMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.collectionsToday.destinationRoute}
            filterParams={shortcutTargets.collectionsToday.filterParams}
            ariaLabel={shortcutTargets.collectionsToday.ariaLabel}
          >
            <span>Collected today</span>
            <strong>Ksh {fmt(collectionsToday)}</strong>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.collectionMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.unpaidDues.destinationRoute}
            filterParams={shortcutTargets.unpaidDues.filterParams}
            ariaLabel={shortcutTargets.unpaidDues.ariaLabel}
          >
            <span>Unpaid dues</span>
            <strong className={scheduledDueStillUnpaid > 0 ? styles.textAmber : styles.textGreen}>Ksh {fmt(scheduledDueStillUnpaid)}</strong>
          </DashboardMetricCard>

          <DashboardMetricCard
            className={`${styles.collectionMetric} ${styles.summaryMetricInteractive}`}
            destinationRoute={shortcutTargets.repayments.destinationRoute}
            filterParams={shortcutTargets.repayments.filterParams}
            ariaLabel={shortcutTargets.repayments.ariaLabel}
          >
            <span>Repayments</span>
            <strong>{repaidLoanCount}</strong>
          </DashboardMetricCard>
        </div>
      </section>
    </div>
  )
}

