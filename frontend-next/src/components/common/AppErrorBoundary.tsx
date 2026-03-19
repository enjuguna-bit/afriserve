import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'
import styles from './AppErrorBoundary.module.css'

type AppErrorBoundaryState = {
  hasError: boolean
}

export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info)
  }

  private resetBoundary = () => {
    this.setState({ hasError: false })
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

    return this.props.children
  }
}
