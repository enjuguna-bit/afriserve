import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import styles from './AppErrorBoundary.module.css'

type AppErrorBoundaryState = {
  hasError: boolean
  // Incrementing resetKey forces React to unmount+remount children on reset,
  // clearing the broken component state instead of re-crashing immediately.
  resetKey: number
}

export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    resetKey: 0,
  }

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      const entry = JSON.stringify({
        level: 'error',
        message: 'ui.unhandled_error',
        error: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        ts: new Date().toISOString(),
      })
      console.error(entry)
    } catch {
      console.error('Unhandled UI error:', error, info)
    }
  }

  private resetBoundary = () => {
    // Increment resetKey so React fully unmounts and remounts children,
    // clearing whatever state triggered the crash.
    this.setState((prev) => ({ hasError: false, resetKey: prev.resetKey + 1 }))
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.shell}>
          <section className={styles.card} aria-live="assertive">
            <p className={styles.eyebrow}>UI recovery mode</p>
            <div>
              <h1 className={styles.title}>Something slipped in this workspace.</h1>
              <p className={styles.description}>
                The application hit an unexpected rendering error. Reset this view first. If the issue persists, reload the page.
              </p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryAction} onClick={this.resetBoundary}>
                Try again
              </button>
              <button type="button" className={styles.secondaryAction} onClick={() => window.location.reload()}>
                Reload page
              </button>
            </div>
          </section>
        </div>
      )
    }

    // Keyed wrapper forces full remount of children after a reset
    return <div key={this.state.resetKey}>{this.props.children}</div>
  }
}
