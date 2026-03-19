import styles from './AsyncState.module.css'
import { EmptyState } from './EmptyState'

type AsyncStateProps = {
  loading?: boolean
  error?: boolean
  empty?: boolean
  skeletonLines?: number
  loadingText?: string
  errorText?: string
  errorDetail?: string
  emptyTitle?: string
  emptyText?: string
  emptyActionText?: string
  onRetry?: () => void
  onEmptyAction?: () => void
  retryText?: string
}

export function AsyncState({
  loading,
  error,
  empty,
  skeletonLines = 4,
  loadingText = 'Loading...',
  errorText = 'Something went wrong.',
  errorDetail,
  emptyTitle,
  emptyText = 'No data found.',
  emptyActionText,
  onRetry,
  onEmptyAction,
  retryText = 'Retry',
}: AsyncStateProps) {
  if (loading) {
    return (
      <div className={styles.skeletonWrap} role="status" aria-live="polite" aria-label={loadingText}>
        <span className={styles.srOnly}>{loadingText}</span>
        <div className={styles.skeletonSurface}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonHeading}`} />
          <div className={styles.skeletonStack}>
            {Array.from({ length: Math.max(1, skeletonLines) }).map((_, index) => (
              <div
                key={`${loadingText}-${index}`}
                className={`${styles.skeletonBlock} ${styles.skeletonLine}`}
                style={{ width: `${Math.max(42, 100 - index * 8)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${styles.state} ${styles.error}`}>
        <div className={styles.errorTitle}>{errorText}</div>
        {errorDetail ? <div className={styles.detail}>{errorDetail}</div> : null}
        {onRetry ? (
          <div className={styles.actions}>
            <button type="button" onClick={onRetry}>
              {retryText}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  if (empty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyText}
        actionLabel={emptyActionText}
        onAction={onEmptyAction}
      />
    )
  }

  return null
}
