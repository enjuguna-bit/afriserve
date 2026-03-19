import { motion, useReducedMotion } from 'framer-motion'
import styles from './EmptyState.module.css'

type EmptyStateProps = {
  eyebrow?: string
  title?: string
  description: string
  actionLabel?: string
  onAction?: () => void
  visual?: 'default' | 'search' | 'table' | 'warning'
}

export function EmptyState({
  eyebrow = 'Workspace state',
  title = 'Nothing to show yet',
  description,
  actionLabel,
  onAction,
  visual = 'default',
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      className={`${styles.emptyState} ${styles[visual] || ''}`}
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className={styles.artwork} aria-hidden="true">
        <span className={styles.halo} />
        <span className={styles.ring} />
        <span className={styles.card} />
        <span className={styles.spark} />
        <span className={styles.dot} />
      </div>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </motion.section>
  )
}
