/**
 * Mirrors the CSS design system so charts feel native to the dark dashboard.
 */
import type React from 'react'

export const CHART_COLORS = {
  emerald:    '#00dc96',
  emeraldDim: '#00b87d',
  blue:       '#4b9cf5',
  gold:       '#f5a623',
  red:        '#ff6b6b',
  redDim:     '#e05555',
  muted:      '#4a6280',
  mutedSoft:  '#2a3d54',
  surface:    '#0e1929',
  border:     'rgba(255,255,255,0.07)',
  text:       '#e8f1fb',
  textMuted:  '#7a92ae',
  textDim:    '#4a6280',
} as const

/** PAR bucket colours — ordered worst → best */
export const PAR_COLORS = {
  par30:      CHART_COLORS.gold,
  par60:      '#f97316',
  par90:      '#ef4444',
  npl:        '#991b1b',
  writtenOff: '#9333ea',
} as const

/** Income stream colours */
export const INCOME_COLORS = {
  interest:  CHART_COLORS.emerald,
  fees:      CHART_COLORS.blue,
  penalties: CHART_COLORS.gold,
} as const

/** Borrower type colours */
export const BORROWER_COLORS = {
  firstTime: CHART_COLORS.emerald,
  repeat:    CHART_COLORS.blue,
  other:     CHART_COLORS.muted,
} as const

/** Product tier colours — 5W / 7W / 10W */
export const TIER_COLORS: Record<string, string> = {
  '5w':   CHART_COLORS.emerald,
  '7w':   CHART_COLORS.blue,
  '10w':  CHART_COLORS.gold,
  other:  CHART_COLORS.muted,
}

/** Shared tooltip style injected via contentStyle prop */
export const TOOLTIP_STYLE: React.CSSProperties = {
  background:   'rgba(11,20,35,0.97)',
  border:       '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12,
  boxShadow:    '0 8px 32px rgba(0,0,0,0.5)',
  fontSize:     13,
  color:        '#e8f1fb',
  padding:      '10px 14px',
}

export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color:         '#7a92ae',
  marginBottom:  4,
  fontSize:      11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

export const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color:      '#e8f1fb',
  fontWeight: 600,
}

/** Compact currency formatter for axis / tooltip labels */
export function fmtAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

