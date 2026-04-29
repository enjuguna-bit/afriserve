const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SQL_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?: ?(Z|[+-]\d{2}(?::?\d{2})?))?$/

function normalizeTimezoneSuffix(value: string): string {
  if (!value || value === 'Z') {
    return value
  }
  if (/^[+-]\d{2}$/.test(value)) {
    return `${value}:00`
  }
  if (/^[+-]\d{4}$/.test(value)) {
    return `${value.slice(0, 3)}:${value.slice(3)}`
  }
  return value
}

function toValidDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function parseDisplayDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date || typeof value === 'number') {
    return toValidDate(value)
  }

  const normalized = String(value).trim()
  if (!normalized) {
    return null
  }

  if (DATE_ONLY_PATTERN.test(normalized)) {
    return toValidDate(`${normalized}T00:00:00`)
  }

  const sqlTimestamp = normalized.match(SQL_TIMESTAMP_PATTERN)
  if (sqlTimestamp) {
    const [, datePart, timePart, zonePart = ''] = sqlTimestamp
    return toValidDate(`${datePart}T${timePart}${normalizeTimezoneSuffix(zonePart)}`)
  }

  return toValidDate(normalized)
}

function formatInvalidDateFallback(fallback: string): string {
  return String(fallback || '-')
}

export function formatDisplayDate(
  value: unknown,
  fallback = '-',
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  const date = parseDisplayDate(value)
  if (!date) {
    return formatInvalidDateFallback(fallback)
  }

  return date.toLocaleDateString(undefined, options)
}

export function formatDisplayDateTime(value: unknown, fallback = '-'): string {
  const date = parseDisplayDate(value)
  if (!date) {
    return formatInvalidDateFallback(fallback)
  }

  return date.toLocaleString()
}
