import styles from './MetricsGrid.module.css'

type Metric = {
  label: string
  value: string
}

const starterMetrics: Metric[] = [
  { label: 'Active Clients', value: '--' },
  { label: 'Outstanding Loans', value: '--' },
  { label: 'Today Collections', value: '--' },
  { label: 'At-Risk Portfolio', value: '--' },
]

export function MetricsGrid() {
  return (
    <div className={styles.grid}>
      {starterMetrics.map((metric) => (
        <article key={metric.label} className={styles.metric}>
          <div className={styles.label}>{metric.label}</div>
          <div className={styles.value}>{metric.value}</div>
        </article>
      ))}
    </div>
  )
}
