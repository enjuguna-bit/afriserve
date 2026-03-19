import React from 'react'
import { CHART_COLORS } from './ChartTheme'

interface ChartContainerProps {
  title?: string
  subtitle?: string
  /** Height applied to the inner chart area. Passed to chart wrapper via children. */
  height?: number | string
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * Styled card wrapper for charts.
 * Chart wrappers (DonutChartWrapper, BarChartWrapper, AreaChartWrapper) are self-contained
 * and include their own ResponsiveContainer — do NOT nest a second one here.
 */
export const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  subtitle,
  height = 260,
  children,
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        background: 'rgba(14, 25, 41, 0.5)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: '20px',
        padding: '20px 22px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {(title || subtitle) && (
        <div>
          {title && (
            <h3 style={{
              margin: 0,
              fontSize: '0.88rem',
              fontWeight: 700,
              color: CHART_COLORS.text,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            } as React.CSSProperties}>
              {title}
            </h3>
          )}
          {subtitle && (
            <p style={{
              margin: '3px 0 0 0',
              fontSize: '0.78rem',
              color: CHART_COLORS.textMuted,
            }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      {/* Children (chart wrappers) control their own height via their height prop */}
      <div style={{ flex: 1, minHeight: height }}>
        {children}
      </div>
    </div>
  )
}
