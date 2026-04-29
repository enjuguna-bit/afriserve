const MISSING_STRING_TOKENS = new Set(['', 'null', 'undefined', 'nan', '[object object]'])

function normalizeDisplayString(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return MISSING_STRING_TOKENS.has(trimmed.toLowerCase()) ? null : trimmed
}

export function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'string') {
    return normalizeDisplayString(value) !== null
  }

  return true
}

export function formatDisplayText(value: unknown, fallback = '-'): string {
  if (!hasDisplayValue(value)) {
    return fallback
  }

  if (typeof value === 'string') {
    return normalizeDisplayString(value) || fallback
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toLocaleString()
  }

  try {
    const stringified = String(value)
    return normalizeDisplayString(stringified) || fallback
  } catch {
    return fallback
  }
}

export function resolveDisplayText(values: unknown[], fallback = '-'): string {
  for (const value of values) {
    if (hasDisplayValue(value)) {
      return formatDisplayText(value, fallback)
    }
  }

  return fallback
}

export function formatDisplayLabel(value: unknown, fallback = '-'): string {
  const normalized = formatDisplayText(value, '')
  if (!normalized) {
    return fallback
  }

  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

export function formatDisplayReference(label: unknown, id: unknown, fallback = '-'): string {
  const normalizedLabel = hasDisplayValue(label) ? formatDisplayText(label, '') : ''
  const normalizedId = hasDisplayValue(id) ? formatDisplayText(id, '') : ''

  if (normalizedLabel && normalizedId) {
    return `${normalizedLabel} #${normalizedId}`
  }
  if (normalizedLabel) {
    return normalizedLabel
  }
  if (normalizedId) {
    return `#${normalizedId}`
  }

  return fallback
}

export function formatDisplayDetails(value: unknown, fallback = '-'): string {
  if (!hasDisplayValue(value)) {
    return fallback
  }

  if (typeof value === 'string') {
    const normalized = normalizeDisplayString(value)
    if (!normalized) {
      return fallback
    }

    try {
      return formatDisplayDetails(JSON.parse(normalized), fallback)
    } catch {
      return normalized
    }
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toLocaleString()
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? JSON.stringify(value, null, 2) : fallback
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : fallback
  }

  return fallback
}
