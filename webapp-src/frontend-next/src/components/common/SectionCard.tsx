import type { PropsWithChildren } from 'react'
import styles from './SectionCard.module.css'

type SectionCardProps = PropsWithChildren<{
  title: string
}>

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  )
}
