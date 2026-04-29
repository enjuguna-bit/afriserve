import { useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadReport } from '../../../services/reportService'
import type { MonthlyPerformanceProductTier } from '../../../types/report'
import { useMonthlyPerformanceReport } from '../../reports/hooks/useReports'
import { downloadBlob } from '../../../utils/fileDownload'
import { useToastStore } from '../../../store/toastStore'
import { feedback } from '../../../utils/feedback'
import styles from '../styles/StakeholderPage.module.css'
import {
  DonutChartWrapper,
  BarChartWrapper,
  ChartContainer,
  INCOME_COLORS,
  TIER_COLORS,
  CHART_COLORS,
} from '../../../components/charts'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function fmt(value: number | undefined) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(part: number, total: number): string {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

// Ordered product tiers for consistent display
const TIER_ORDER = ['5w', '7w', '10w', 'other'] as const
const TIER_LABELS: Record<string, string> = {
  '5w':    '5-week loans',
  '7w':    '7-week loans',
  '10w':   '10-week loans',
  'other': 'Other / unlinked',
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function StakeholderIncomePage() {
  const pushToast = useToastStore((s) => s.pushToast)
  const [exporting, setExporting] = useState<string | null>(null)

  const query = useMonthlyPerformanceReport({})

  const data = query.data
  const total = Number(data?.total_income || 0)
  const interest = Number(data?.interest_income || 0)
  const fees = Number(data?.fee_income || 0)
  const penalties = Number(data?.penalty_income || 0)

  const productBreakdown: Record<string, MonthlyPerformanceProductTier> = data?.interest_by_product ?? {}
  const hasProductBreakdown = Object.values(productBreakdown).some(t => t.amount > 0)

  // â”€â”€ Chart data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const incomeDonutData = [
    { name: 'Interest', value: interest,  color: INCOME_COLORS.interest },
    { name: 'Fees',     value: fees,      color: INCOME_COLORS.fees     },
    { name: 'Penalties',value: penalties, color: INCOME_COLORS.penalties},
  ].filter(d => d.value > 0)

  const productBarData = TIER_ORDER
    .map((key) => {
      const tier = productBreakdown[key]
      if (!tier || tier.amount === 0) return null
      return {
        name:  TIER_LABELS[key] ?? tier.label,
        amount: tier.amount,
        loans:  tier.loanCount,
        color:  TIER_COLORS[key] ?? CHART_COLORS.muted,
      }
    })
    .filter(Boolean) as { name: string; amount: number; loans: number; color: string }[]

  const handleExport = async (format: 'csv' | 'xlsx') => {
    const key = `income-${format}`
    setExporting(key)
    try {
      const { blob, filename } = await downloadReport('/reports/performance/monthly', {}, format)
      downloadBlob(blob, filename || `monthly-income.${format}`)
      pushToast({ type: 'success', message: feedback.system.exportReady('monthly income') })
    } catch {
      pushToast({ type: 'error', message: 'Could not export the monthly income report. Please try again.' })
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className={styles.page}>

      {/* â”€â”€ Page header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Stakeholders - Income</p>
          <h1 className={styles.pageTitle}>Monthly income</h1>
          <p className={styles.pageSubtitle}>
            Collections and collected fees for{' '}
            {data?.month ? `the period ending ${data.month}` : 'the current calendar month'}.
            Resets at midnight UTC on the 1st of each month.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/stakeholders/capital" className={styles.exportBtn} style={{ textDecoration: 'none' }}>
            Capital transactions
          </Link>
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exporting !== null || query.isLoading}
            onClick={() => void handleExport('csv')}
          >
            {exporting === 'income-csv' ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            disabled={exporting !== null || query.isLoading}
            onClick={() => void handleExport('xlsx')}
          >
            {exporting === 'income-xlsx' ? 'Exporting...' : 'Export XLSX'}
          </button>
        </div>
      </div>

      {query.isLoading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading income data...</span>
        </div>
      )}

      {query.isError && (
        <div className={styles.errorState}>
          <strong>Could not load income data.</strong>
          <button type="button" onClick={() => void query.refetch()}>Retry</button>
        </div>
      )}

      {!query.isLoading && !query.isError && (
        <>
          {/* â”€â”€ Total headline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className={styles.headlineCard}>
            <div className={styles.headlineLabel}>Total monthly income</div>
            <div className={styles.headlineValue}>Ksh {fmt(total)}</div>
            <div className={styles.headlineSub}>Cycle: {data?.month || 'current month'}</div>
          </div>

          {/* â”€â”€ Top-level stream cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className={styles.breakdownGrid}>
            <div className={styles.incomeCard}>
              <div className={styles.incomeCardTop}>
                <span className={styles.incomeLabel}>Interest income</span>
                <span className={styles.incomePct}>{pct(interest, total)}</span>
              </div>
              <div className={styles.incomeValue}>Ksh {fmt(interest)}</div>
              <div className={styles.incomeBar}>
                <div className={styles.incomeBarFill} style={{ width: pct(interest, total), background: INCOME_COLORS.interest }} />
              </div>
              <p className={styles.incomeNote}>Charged on outstanding principal per repayment schedule</p>
            </div>

            <div className={styles.incomeCard}>
              <div className={styles.incomeCardTop}>
                <span className={styles.incomeLabel}>Fee revenue</span>
                <span className={styles.incomePct}>{pct(fees, total)}</span>
              </div>
              <div className={styles.incomeValue}>Ksh {fmt(fees)}</div>
              <div className={styles.incomeBar}>
                <div className={styles.incomeBarFill} style={{ width: pct(fees, total), background: INCOME_COLORS.fees }} />
              </div>
              <p className={styles.incomeNote}>Origination, processing, and maintenance fees</p>
            </div>

            <div className={styles.incomeCard}>
              <div className={styles.incomeCardTop}>
                <span className={styles.incomeLabel}>Penalty collections</span>
                <span className={styles.incomePct}>{pct(penalties, total)}</span>
              </div>
              <div className={styles.incomeValue}>Ksh {fmt(penalties)}</div>
              <div className={styles.incomeBar}>
                <div className={styles.incomeBarFill} style={{ width: pct(penalties, total), background: INCOME_COLORS.penalties }} />
              </div>
              <p className={styles.incomeNote}>Late payment and default penalties collected</p>
            </div>
          </div>

          {/* â”€â”€ ðŸ“Š Income composition charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {incomeDonutData.length > 0 && (
            <div className={styles.chartRow}>
              {/* Donut â€” visual split of income streams */}
              <ChartContainer
                title="Income composition"
                subtitle="Visual split: interest Â· fees Â· penalties"
                height={220}
                style={{ flex: 1, minWidth: 240 }}
              >
                <DonutChartWrapper
                  data={incomeDonutData}
                  innerRadius={62}
                  outerRadius={88}
                  centerLabel={`Ksh ${(total / 1000).toFixed(0)}K`}
                  centerSub="total"
                  height={220}
                />
              </ChartContainer>

              {/* Legend / breakdown beside the donut */}
              <div className={styles.chartLegendCard}>
                <p className={styles.chartLegendTitle}>Stream breakdown</p>
                {incomeDonutData.map((d) => (
                  <div key={d.name} className={styles.chartLegendRow}>
                    <span className={styles.chartLegendDot} style={{ background: d.color }} />
                    <span className={styles.chartLegendLabel}>{d.name}</span>
                    <span className={styles.chartLegendValue}>Ksh {fmt(d.value)}</span>
                    <span className={styles.chartLegendPct}>{pct(d.value, total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* â”€â”€ Interest by product (5W / 7W / 10W) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {hasProductBreakdown && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Interest income by loan product</h2>
              <p className={styles.panelSubtitle}>
                Each interest stream subdivided by repayment duration. Entries without a linked loan are shown under "Other".
              </p>

              {/* Product tier cards */}
              <div className={styles.productGrid}>
                {TIER_ORDER.map((key) => {
                  const tier = productBreakdown[key]
                  if (!tier) return null
                  const color = TIER_COLORS[key] ?? '#94a3b8'
                  return (
                    <div key={key} className={styles.productCard}>
                      <div className={styles.productCardAccent} style={{ background: color }} />
                      <div className={styles.productCardBody}>
                        <div className={styles.productCardTop}>
                          <span className={styles.productLabel}>{TIER_LABELS[key] ?? tier.label}</span>
                          <span className={styles.productPct}>{pct(tier.amount, interest)}</span>
                        </div>
                        <div className={styles.productValue}>Ksh {fmt(tier.amount)}</div>
                        <div className={styles.productBar}>
                          <div className={styles.productBarFill} style={{ width: pct(tier.amount, interest), background: color }} />
                        </div>
                        <div className={styles.productMeta}>
                          {tier.loanCount > 0 ? `${tier.loanCount} loan${tier.loanCount !== 1 ? 's' : ''}` : 'No loans in period'}
                          {' Â· '}
                          <span className={styles.accountCode}>{tier.accountCode}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ðŸ“Š Product tier horizontal bar chart */}
              {productBarData.length > 0 && (
                <ChartContainer
                  title="Interest amount by product tier"
                  subtitle="Horizontal comparison â€” Ksh per loan product"
                  height={Math.max(120, productBarData.length * 52)}
                >
                  <BarChartWrapper
                    data={productBarData}
                    xKey="name"
                    yKey="amount"
                    layout="vertical"
                    height={Math.max(120, productBarData.length * 52)}
                  />
                </ChartContainer>
              )}

              {/* Product breakdown table */}
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Product tier</th>
                    <th>GL account</th>
                    <th className={styles.tdRight}>Loans</th>
                    <th className={styles.tdRight}>Amount (Ksh)</th>
                    <th className={styles.tdRight}>Share of interest</th>
                  </tr>
                </thead>
                <tbody>
                  {TIER_ORDER.map((key) => {
                    const tier = productBreakdown[key]
                    if (!tier) return null
                    return (
                      <tr key={key}>
                        <td>{TIER_LABELS[key] ?? tier.label}</td>
                        <td><span className={styles.monoSmall}>{tier.accountCode}</span></td>
                        <td className={styles.tdRight}>{tier.loanCount}</td>
                        <td className={styles.tdRight}>{fmt(tier.amount)}</td>
                        <td className={styles.tdRight}>{pct(tier.amount, interest)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className={styles.totalsRow}>
                    <td colSpan={2}><strong>Interest total</strong></td>
                    <td className={styles.tdRight}>
                      <strong>{TIER_ORDER.reduce((s, k) => s + (productBreakdown[k]?.loanCount ?? 0), 0)}</strong>
                    </td>
                    <td className={styles.tdRight}><strong>Ksh {fmt(interest)}</strong></td>
                    <td className={styles.tdRight}><strong>100%</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* â”€â”€ Full income composition table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Income composition</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Income stream</th>
                  <th className={styles.tdRight}>Amount (Ksh)</th>
                  <th className={styles.tdRight}>Share</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Interest income</td>
                  <td className={styles.tdRight}>{fmt(interest)}</td>
                  <td className={styles.tdRight}>{pct(interest, total)}</td>
                </tr>
                {hasProductBreakdown && TIER_ORDER.map((key) => {
                  const tier = productBreakdown[key]
                  if (!tier || tier.amount === 0) return null
                  return (
                    <tr key={key} className={styles.subRow}>
                      <td style={{ paddingLeft: '2rem' }}>â†³ {TIER_LABELS[key] ?? tier.label}</td>
                      <td className={styles.tdRight}>{fmt(tier.amount)}</td>
                      <td className={styles.tdRight}>{pct(tier.amount, total)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td>Fee revenue</td>
                  <td className={styles.tdRight}>{fmt(fees)}</td>
                  <td className={styles.tdRight}>{pct(fees, total)}</td>
                </tr>
                <tr>
                  <td>Penalty collections</td>
                  <td className={styles.tdRight}>{fmt(penalties)}</td>
                  <td className={styles.tdRight}>{pct(penalties, total)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className={styles.totalsRow}>
                  <td><strong>Total</strong></td>
                  <td className={styles.tdRight}><strong>Ksh {fmt(total)}</strong></td>
                  <td className={styles.tdRight}><strong>100%</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className={styles.footerNote}>
            All figures in Kenyan Shillings (Ksh). Monthly performance figures represent collected
            interest, collected penalties, and fees recognized in the current calendar period.
            Interest by product is derived from repayment allocations joined to loan terms.
          </p>
        </>
      )}
    </div>
  )
}
