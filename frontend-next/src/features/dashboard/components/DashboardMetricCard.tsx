import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type DashboardFilterPrimitive = string | number | boolean
export type DashboardFilterValue =
  | DashboardFilterPrimitive
  | null
  | undefined
  | Array<DashboardFilterPrimitive | null | undefined>

export type DashboardFilterParams = Record<string, DashboardFilterValue>

export type DashboardMetricShortcutConfig = {
  destinationRoute?: string
  filterParams?: DashboardFilterParams
  ariaLabel?: string
}

type DashboardMetricCardProps = DashboardMetricShortcutConfig & {
  children: ReactNode
  className: string
  as?: 'article' | 'div'
}

function normalizeDashboardFilterValue(value: DashboardFilterValue): string | null {
  if (Array.isArray(value)) {
    const serialized = value
      .filter((entry): entry is DashboardFilterPrimitive => entry !== null && typeof entry !== 'undefined')
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)

    return serialized.length > 0 ? serialized.join(',') : null
  }

  if (value === null || typeof value === 'undefined') {
    return null
  }

  const serialized = String(value).trim()
  return serialized.length > 0 ? serialized : null
}

export function buildDashboardDestinationHref(
  destinationRoute: string,
  filterParams: DashboardFilterParams = {},
) {
  const [pathname, search = ''] = String(destinationRoute || '').split('?', 2)
  const params = new URLSearchParams(search)

  Object.entries(filterParams).forEach(([key, value]) => {
    const normalizedValue = normalizeDashboardFilterValue(value)
    if (normalizedValue === null) {
      return
    }

    params.set(key, normalizedValue)
  })

  const queryString = params.toString()
  return queryString ? `${pathname}?${queryString}` : pathname
}

export function DashboardMetricCard({
  children,
  className,
  destinationRoute,
  filterParams,
  ariaLabel,
  as = 'article',
}: DashboardMetricCardProps) {
  if (destinationRoute) {
    return (
      <Link
        className={className}
        to={buildDashboardDestinationHref(destinationRoute, filterParams)}
        aria-label={ariaLabel}
      >
        {children}
      </Link>
    )
  }

  if (as === 'div') {
    return <div className={className}>{children}</div>
  }

  return <article className={className}>{children}</article>
}
