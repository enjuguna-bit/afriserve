import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from '../pages/DashboardPage.module.css'

type DashboardDeepDivePanelsProps = {
  borrowerCount: number
  activeCustomerCount: number
  outstandingBalance: number
  totalArrears: number
  preWriteoffMonitoredBalance: number
  writeOffOrNplTotal: number
  nplBalance: number
  nplLoanCount: number
  collectionCoverage: number
  dueNow: number
  unpaidDue: number
  collectionsToday: number
  arrearsBacklog: number
  newClients: number
  firstTimeBorrowers: number
  repeatBorrowers: number
  repaidLoanCount: number
  overdueAmount: number
  writtenOffBalance: number
  overdueInstallments: number
  restructuredLoans: number
  loansDisbursed: number
  totalDisbursedAmount: number
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`
}

function getRiskClass(ratio: number) {
  if (ratio < 0.05) return styles.textGreen
  if (ratio < 0.1) return styles.textAmber
  return styles.textRed
}

export function DashboardDeepDivePanels({
  borrowerCount,
  activeCustomerCount,
  outstandingBalance,
  totalArrears,
  preWriteoffMonitoredBalance,
  writeOffOrNplTotal,
  nplBalance,
  nplLoanCount,
  collectionCoverage,
  dueNow,
  unpaidDue,
  collectionsToday,
  arrearsBacklog,
  newClients,
  firstTimeBorrowers,
  repeatBorrowers,
  repaidLoanCount,
  overdueAmount,
  writtenOffBalance,
  overdueInstallments,
  restructuredLoans,
  loansDisbursed,
  totalDisbursedAmount,
}: DashboardDeepDivePanelsProps) {
  const [activeTab, setActiveTab] = useState<'arrears' | 'disbursements' | 'clients'>('arrears')
  const arrearsRatio = outstandingBalance > 0 ? totalArrears / outstandingBalance : 0

  return (
    <>
      <div className={styles.middleSectionGrid}>
        <section className={styles.watchSection}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.panelEyebrow}>Risk Watch</p>
            <h2>Active portfolio and NPL monitoring</h2>
          </div>
        </div>
        <div className={styles.watchGrid}>
          <article className={styles.watchCard}>
            <span>Total customers</span>
            <strong>{borrowerCount}</strong>
          </article>
          <article className={styles.watchCard}>
            <span>Active customers</span>
            <strong>{activeCustomerCount}</strong>
          </article>
          <article className={styles.watchCard}>
            <span>Total active OLB</span>
            <strong>Ksh {formatCurrency(outstandingBalance)}</strong>
          </article>
          <article className={styles.watchCard}>
            <span>Total arrears</span>
            <strong className={getRiskClass(arrearsRatio)}>Ksh {formatCurrency(totalArrears)}</strong>
          </article>
          <article className={styles.watchCard}>
            <span>Actively monitored pre-writeoff (PAR60)</span>
            <strong>Ksh {formatCurrency(preWriteoffMonitoredBalance)}</strong>
          </article>
          <article className={styles.watchCard}>
            <span>Total in write-off or NPL</span>
            <strong className={nplBalance > 0 ? styles.textRed : undefined}>Ksh {formatCurrency(writeOffOrNplTotal)}</strong>
            <em>NPL 90+: Ksh {formatCurrency(nplBalance)} ({nplLoanCount} loans)</em>
          </article>
        </div>
      </section>

      <section className={styles.collectionPanel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.panelEyebrow}>Collections</p>
            <h2>Branch collection pulse</h2>
          </div>
          <div className={styles.panelBadge}>{formatPercent(collectionCoverage)}</div>
        </div>

        <div className={styles.collectionGrid}>
          <div className={styles.collectionMetric}>
            <span>Due today</span>
            <strong>Ksh {formatCurrency(dueNow)}</strong>
          </div>
          <div className={styles.collectionMetric}>
            <span>Still unpaid today</span>
            <strong>Ksh {formatCurrency(unpaidDue)}</strong>
          </div>
          <div className={styles.collectionMetric}>
            <span>Paid today</span>
            <strong>Ksh {formatCurrency(collectionsToday)}</strong>
          </div>
          <div className={styles.collectionMetric}>
            <span>Arrears carried</span>
            <strong>Ksh {formatCurrency(arrearsBacklog)}</strong>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <span style={{ fontSize: '0.86rem', color: '#6d7a8e', fontWeight: 600 }}>Today's collection coverage</span>
          <div className={styles.progressRail}>
            <div className={styles.progressFill} style={{ width: `${Math.max(collectionCoverage * 100, 6)}%` }} />
          </div>
        </div>
      </section>
      </div>

      <section className={styles.analyticsGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Productivity</p>
              <h2>Borrower acquisition and loan flow</h2>
            </div>
          </div>
          <div className={styles.metricStack}>
            <div className={styles.stackRow}>
              <span>New clients this month</span>
              <strong>{newClients}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>First-time borrowers</span>
              <strong>{firstTimeBorrowers}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Repeat borrowers</span>
              <strong>{repeatBorrowers}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Repayments today</span>
              <strong>{repaidLoanCount}</strong>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Risk</p>
              <h2>Portfolio quality snapshot</h2>
            </div>
          </div>
          <div className={styles.metricStack}>
            <div className={styles.stackRow}>
              <span>Overdue amount</span>
              <strong className={overdueAmount > 0 ? styles.textAmber : undefined}>Ksh {formatCurrency(overdueAmount)}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Written-off balance</span>
              <strong className={writtenOffBalance > 0 ? styles.textRed : undefined}>Ksh {formatCurrency(writtenOffBalance)}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Overdue installments</span>
              <strong>{overdueInstallments}</strong>
            </div>
            <div className={styles.stackRow}>
              <span>Restructured loans</span>
              <strong>{restructuredLoans}</strong>
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Reports</p>
              <h2>Reports at a glance</h2>
            </div>
          </div>
          
          <div className={styles.tabsList} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'arrears'}
              className={styles.tabBtn}
              data-active={activeTab === 'arrears'}
              onClick={() => setActiveTab('arrears')}
            >
              Arrears
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'disbursements'}
              className={styles.tabBtn}
              data-active={activeTab === 'disbursements'}
              onClick={() => setActiveTab('disbursements')}
            >
              Disbursed
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'clients'}
              className={styles.tabBtn}
              data-active={activeTab === 'clients'}
              onClick={() => setActiveTab('clients')}
            >
              Clients
            </button>
          </div>

          <div role="tabpanel">
            {activeTab === 'arrears' && (
              <div className={styles.metricStack}>
                <div className={styles.stackRow}>
                  <span>Total Arrears (incl. backlog)</span>
                  <strong>Ksh {formatCurrency(totalArrears)}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>PAR 30 (Overdue amount)</span>
                  <strong>Ksh {formatCurrency(overdueAmount)}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>PAR 60 (Pre-writeoff view)</span>
                  <strong>Ksh {formatCurrency(preWriteoffMonitoredBalance)}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>PAR 90 (NPL)</span>
                  <strong>Ksh {formatCurrency(nplBalance)}</strong>
                </div>
                <Link to="/reports?tab=arrears" className={styles.tabLink}>Open full arrears report &rarr;</Link>
              </div>
            )}
            
            {activeTab === 'disbursements' && (
              <div className={styles.metricStack}>
                <div className={styles.stackRow}>
                  <span>Loans disbursed this month</span>
                  <strong>{loansDisbursed}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>Total amount disbursed</span>
                  <strong>Ksh {formatCurrency(totalDisbursedAmount)}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>Active portfolio size</span>
                  <strong>Ksh {formatCurrency(outstandingBalance)}</strong>
                </div>
                <Link to="/reports?tab=disbursements" className={styles.tabLink}>Open disbursements report &rarr;</Link>
              </div>
            )}

            {activeTab === 'clients' && (
              <div className={styles.metricStack}>
                <div className={styles.stackRow}>
                  <span>New clients this month</span>
                  <strong>{newClients}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>First-time borrowers</span>
                  <strong>{firstTimeBorrowers}</strong>
                </div>
                <div className={styles.stackRow}>
                  <span>Repeat borrowers</span>
                  <strong>{repeatBorrowers}</strong>
                </div>
                <Link to="/reports?tab=clients" className={styles.tabLink}>Open client summary report &rarr;</Link>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  )
}
