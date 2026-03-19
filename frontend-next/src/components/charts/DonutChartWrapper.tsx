import React from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, TOOLTIP_ITEM_STYLE } from './ChartTheme'

interface DonutChartWrapperProps {
  data: Array<{ name: string; value: number; color?: string }>
  innerRadius?: number
  outerRadius?: number
  /** Text rendered in the donut hole. Defaults to the total of all values. */
  centerLabel?: string
  /** Smaller sub-text below the center label */
  centerSub?: string
  height?: number | string
}

export const DonutChartWrapper: React.FC<DonutChartWrapperProps> = ({
  data,
  innerRadius = 60,
  outerRadius = 80,
  centerLabel,
  centerSub,
  height = '100%',
}) => {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const displayLabel = centerLabel ?? total.toLocaleString()

  return (
    // position:relative so the center-label overlay can be positioned absolute
    <div style={{ position: 'relative', width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
            animationDuration={900}
            animationEasing="ease-out"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color ?? Object.values(CHART_COLORS)[index % 5]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value, name) => [
              value != null ? Number(value).toLocaleString() : "",
              String(name),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center label — CSS overlay, not SVG, to avoid recharts child restrictions */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
          <div style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: CHART_COLORS.text,
            letterSpacing: '-0.01em',
          }}>
            {displayLabel}
          </div>
          {centerSub && (
            <div style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: CHART_COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              marginTop: 2,
            }}>
              {centerSub}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
