import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer, Legend,
} from 'recharts'
import {
  CHART_COLORS, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE, fmtAxis,
} from './ChartTheme'

interface BarChartWrapperProps {
  data: Record<string, unknown>[]
  xKey: string
  /** Single bar key OR array of keys for grouped bars */
  yKey: string | string[]
  /** Colors — one per yKey */
  colors?: string[]
  /** Single legacy color (used when yKey is a string) */
  color?: string
  height?: number | string
  layout?: 'horizontal' | 'vertical'
  /** Show recharts Legend beneath the chart */
  showLegend?: boolean
}

export const BarChartWrapper: React.FC<BarChartWrapperProps> = ({
  data,
  xKey,
  yKey,
  colors,
  color = CHART_COLORS.blue,
  height = '100%',
  layout = 'horizontal',
  showLegend = false,
}) => {
  const keys  = Array.isArray(yKey) ? yKey : [yKey]
  const palette = colors ?? keys.map((_, i) => [
    CHART_COLORS.emerald,
    CHART_COLORS.blue,
    CHART_COLORS.gold,
    CHART_COLORS.red,
    CHART_COLORS.muted,
  ][i % 5])

  const isVertical = layout === 'vertical'

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 6, right: 12, left: isVertical ? 4 : -16, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={!isVertical}
            horizontal={isVertical}
            stroke="rgba(255,255,255,0.05)"
          />

          {isVertical ? (
            <>
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtAxis}
                tick={{ fill: CHART_COLORS.textDim, fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                axisLine={false}
                tickLine={false}
                tick={{ fill: CHART_COLORS.textMuted, fontSize: 11 }}
                width={80}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                axisLine={false}
                tickLine={false}
                tick={{ fill: CHART_COLORS.textDim, fontSize: 11 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtAxis}
                tick={{ fill: CHART_COLORS.textDim, fontSize: 10 }}
              />
            </>
          )}

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />

          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted, paddingTop: 12 }}
            />
          )}

          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              fill={palette[i]}
              radius={isVertical ? [0, 6, 6, 0] : [6, 6, 0, 0]}
              barSize={keys.length > 1 ? 18 : 28}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              {/* Per-cell color override — honoured when yKey is a single string */}
              {keys.length === 1 &&
                data.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={(entry['color'] as string | undefined) ?? (colors?.[0] ?? color)}
                    fillOpacity={0.85}
                  />
                ))
              }
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
