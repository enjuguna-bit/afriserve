import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS, TOOLTIP_STYLE, TOOLTIP_LABEL_STYLE, fmtAxis } from './ChartTheme'

interface AreaChartWrapperProps {
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  color?: string
  height?: number | string
}

export const AreaChartWrapper: React.FC<AreaChartWrapperProps> = ({
  data,
  xKey,
  yKey,
  color = CHART_COLORS.emerald,
  height = '100%',
}) => {
  const gradientId = `area-grad-${yKey.replace(/[^a-z0-9]/gi, '-')}`

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.28} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(255,255,255,0.05)"
          />
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
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2.5}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            animationDuration={1200}
            animationEasing="ease-out"
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
