import styles from './RouteLoadingShell.module.css'

type RouteLoadingShellProps = {
  variant?: 'workspace' | 'auth'
}

const workspaceSidebarItems = [0, 1, 2, 3, 4]
const workspaceCards = [0, 1, 2, 3, 4, 5]
const authFeatureLines = [0, 1, 2]
const authFormRows = [0, 1, 2]

export function RouteLoadingShell({ variant = 'workspace' }: RouteLoadingShellProps) {
  if (variant === 'auth') {
    return (
      <div className={`${styles.shell} ${styles.authShell}`} role="status" aria-live="polite" aria-label="Loading page">
        <div className={styles.authFrame}>
          <section className={styles.authHero}>
            <div className={`${styles.block} ${styles.brandMark}`} />
            <div className={`${styles.block} ${styles.authEyebrow}`} />
            <div className={`${styles.block} ${styles.authHeadline}`} />
            <div className={`${styles.block} ${styles.authLead}`} />
            <div className={styles.authList}>
              {authFeatureLines.map((item) => (
                <div key={item} className={styles.authListItem}>
                  <span className={`${styles.block} ${styles.authBullet}`} />
                  <span className={`${styles.block} ${styles.authListLine}`} />
                </div>
              ))}
            </div>
          </section>
          <section className={styles.authCard}>
            <div className={`${styles.block} ${styles.authCardEyebrow}`} />
            <div className={`${styles.block} ${styles.authCardTitle}`} />
            {authFormRows.map((item) => (
              <div key={item} className={styles.authField}>
                <div className={`${styles.block} ${styles.fieldLabel}`} />
                <div className={`${styles.block} ${styles.fieldInput}`} />
              </div>
            ))}
            <div className={`${styles.block} ${styles.authButton}`} />
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.shell} ${styles.workspaceShell}`} role="status" aria-live="polite" aria-label="Loading page">
      <aside className={styles.sidebar}>
        <div className={`${styles.block} ${styles.sidebarBrand}`} />
        <div className={styles.sidebarStack}>
          {workspaceSidebarItems.map((item) => (
            <div key={item} className={`${styles.block} ${styles.sidebarItem}`} />
          ))}
        </div>
      </aside>
      <div className={styles.workspaceMain}>
        <header className={styles.header}>
          <div className={styles.headerLead}>
            <div className={`${styles.block} ${styles.headerEyebrow}`} />
            <div className={`${styles.block} ${styles.headerTitle}`} />
          </div>
          <div className={styles.headerActions}>
            <div className={`${styles.block} ${styles.headerChip}`} />
            <div className={`${styles.block} ${styles.headerProfile}`} />
          </div>
        </header>
        <main className={styles.content}>
          <section className={styles.hero}>
            <div className={`${styles.block} ${styles.heroHeadline}`} />
            <div className={`${styles.block} ${styles.heroLead}`} />
            <div className={styles.heroActions}>
              <div className={`${styles.block} ${styles.heroChip}`} />
              <div className={`${styles.block} ${styles.heroChip}`} />
              <div className={`${styles.block} ${styles.heroChipWide}`} />
            </div>
          </section>
          <section className={styles.cardGrid}>
            {workspaceCards.map((item) => (
              <article key={item} className={styles.dataCard}>
                <div className={`${styles.block} ${styles.cardLabel}`} />
                <div className={`${styles.block} ${styles.cardValue}`} />
                <div className={`${styles.block} ${styles.cardMeta}`} />
              </article>
            ))}
          </section>
        </main>
      </div>
    </div>
  )
}
