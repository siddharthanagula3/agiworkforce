/**
 * ChartWidget Component
 *
 * Simple chart visualization widget supporting bar, line, pie, and area charts.
 * Uses SVG for lightweight rendering without external charting libraries.
 *
 * @module Widgets/ChartWidget
 */

import React, { memo, useMemo, useCallback } from 'react';
import { BarChart2 } from 'lucide-react';
import { WidgetRegistry } from './WidgetRegistry';
import type { ChartWidgetData, WidgetRendererProps } from './index';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
];

const CHART_HEIGHT = 200;
const CHART_PADDING = { top: 20, right: 20, bottom: 40, left: 50 };

// ============================================================================
// Helper Functions
// ============================================================================

function getColor(index: number, customColor?: string): string {
  if (customColor) return customColor;
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length] ?? '#3B82F6';
}

function formatValue(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(value % 1 === 0 ? 0 : 1);
}

// ============================================================================
// Chart Components
// ============================================================================

interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  data: ChartDataPoint[];
  width: number;
  height: number;
  showValues?: boolean;
  onBarClick?: (index: number, point: ChartDataPoint) => void;
}

const BarChart: React.FC<BarChartProps> = memo(
  ({ data, width, height, showValues = true, onBarClick }) => {
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

    const maxValue = Math.max(...data.map((d) => d.value), 0);
    const barWidth = Math.max(20, (chartWidth / data.length) * 0.7);
    const barGap = (chartWidth - barWidth * data.length) / (data.length + 1);

    // Generate Y-axis ticks
    const yTicks = useMemo(() => {
      const tickCount = 5;
      const step = maxValue / (tickCount - 1);
      return Array.from({ length: tickCount }, (_, i) => i * step);
    }, [maxValue]);

    return (
      <svg width={width} height={height} className="overflow-visible">
        {/* Y-axis */}
        <line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top}
          x2={CHART_PADDING.left}
          y2={height - CHART_PADDING.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
        />

        {/* Y-axis ticks and labels */}
        {yTicks.map((tick, i) => {
          const y = height - CHART_PADDING.bottom - (tick / maxValue) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={CHART_PADDING.left - 5}
                y1={y}
                x2={CHART_PADDING.left}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              <line
                x1={CHART_PADDING.left}
                y1={y}
                x2={width - CHART_PADDING.right}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4,4"
              />
              <text
                x={CHART_PADDING.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="text-xs fill-zinc-500"
              >
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        {/* X-axis */}
        <line
          x1={CHART_PADDING.left}
          y1={height - CHART_PADDING.bottom}
          x2={width - CHART_PADDING.right}
          y2={height - CHART_PADDING.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
        />

        {/* Bars */}
        {data.map((point, i) => {
          const barHeight = maxValue > 0 ? (point.value / maxValue) * chartHeight : 0;
          const x = CHART_PADDING.left + barGap + i * (barWidth + barGap);
          const y = height - CHART_PADDING.bottom - barHeight;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={point.color}
                rx={2}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onBarClick?.(i, point)}
              />
              {showValues && point.value > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="text-xs fill-zinc-600 dark:fill-zinc-400 font-medium"
                >
                  {formatValue(point.value)}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={height - CHART_PADDING.bottom + 15}
                textAnchor="middle"
                className="text-xs fill-zinc-500 dark:fill-zinc-400"
              >
                {point.label.length > 10 ? `${point.label.slice(0, 10)}...` : point.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);

BarChart.displayName = 'BarChart';

interface PieChartProps {
  data: ChartDataPoint[];
  width: number;
  height: number;
  showLegend?: boolean;
  onSliceClick?: (index: number, point: ChartDataPoint) => void;
}

const PieChart: React.FC<PieChartProps> = memo(
  ({ data, width, height, showLegend = true, onSliceClick }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const radius = Math.min(width, height) / 2 - 40;
    const centerX = showLegend ? width * 0.35 : width / 2;
    const centerY = height / 2;

    // Calculate slice paths
    const slices = useMemo(() => {
      let startAngle = -Math.PI / 2; // Start from top
      return data.map((point) => {
        const angle = total > 0 ? (point.value / total) * Math.PI * 2 : 0;
        const endAngle = startAngle + angle;

        const x1 = centerX + radius * Math.cos(startAngle);
        const y1 = centerY + radius * Math.sin(startAngle);
        const x2 = centerX + radius * Math.cos(endAngle);
        const y2 = centerY + radius * Math.sin(endAngle);

        const largeArc = angle > Math.PI ? 1 : 0;
        const path = `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        const midAngle = startAngle + angle / 2;
        const labelRadius = radius * 0.7;
        const labelX = centerX + labelRadius * Math.cos(midAngle);
        const labelY = centerY + labelRadius * Math.sin(midAngle);
        const percent = total > 0 ? (point.value / total) * 100 : 0;

        const slice = {
          path,
          labelX,
          labelY,
          percent,
          startAngle,
          endAngle,
        };

        startAngle = endAngle;
        return slice;
      });
    }, [data, total, radius, centerX, centerY]);

    return (
      <svg width={width} height={height}>
        {/* Pie slices */}
        {slices.map((slice, i) => {
          const dataPoint = data[i];
          if (!dataPoint) return null;
          return (
            <g key={i}>
              <path
                d={slice.path}
                fill={dataPoint.color}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onSliceClick?.(i, dataPoint)}
              />
              {slice.percent > 5 && (
                <text
                  x={slice.labelX}
                  y={slice.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs fill-white font-medium pointer-events-none"
                >
                  {slice.percent.toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}

        {/* Legend */}
        {showLegend && (
          <g transform={`translate(${width * 0.65}, ${height * 0.2})`}>
            {data.map((point, i) => (
              <g key={i} transform={`translate(0, ${i * 24})`}>
                <rect width={12} height={12} fill={point.color} rx={2} />
                <text x={18} y={10} className="text-xs fill-zinc-600 dark:fill-zinc-400">
                  {point.label} ({formatValue(point.value)})
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>
    );
  },
);

PieChart.displayName = 'PieChart';

interface LineChartProps {
  data: ChartDataPoint[];
  width: number;
  height: number;
  showValues?: boolean;
  filled?: boolean;
  onPointClick?: (index: number, point: ChartDataPoint) => void;
}

const LineChart: React.FC<LineChartProps> = memo(
  ({ data, width, height, showValues = false, filled = false, onPointClick }) => {
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

    const maxValue = Math.max(...data.map((d) => d.value), 0);
    const minValue = Math.min(...data.map((d) => d.value), 0);
    const valueRange = maxValue - minValue || 1;

    // Calculate points
    const points = useMemo(() => {
      return data.map((point, i) => ({
        x: CHART_PADDING.left + (i / (data.length - 1 || 1)) * chartWidth,
        y: height - CHART_PADDING.bottom - ((point.value - minValue) / valueRange) * chartHeight,
      }));
    }, [data, chartWidth, chartHeight, height, minValue, valueRange]);

    // Generate path
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    const areaPath = filled
      ? `${linePath} L ${points[points.length - 1]?.x ?? 0} ${height - CHART_PADDING.bottom} L ${CHART_PADDING.left} ${height - CHART_PADDING.bottom} Z`
      : '';

    return (
      <svg width={width} height={height} className="overflow-visible">
        {/* Y-axis */}
        <line
          x1={CHART_PADDING.left}
          y1={CHART_PADDING.top}
          x2={CHART_PADDING.left}
          y2={height - CHART_PADDING.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
        />

        {/* X-axis */}
        <line
          x1={CHART_PADDING.left}
          y1={height - CHART_PADDING.bottom}
          x2={width - CHART_PADDING.right}
          y2={height - CHART_PADDING.bottom}
          stroke="currentColor"
          strokeOpacity={0.2}
        />

        {/* Filled area */}
        {filled && (
          <path d={areaPath} fill={data[0]?.color ?? DEFAULT_COLORS[0]} fillOpacity={0.2} />
        )}

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={data[0]?.color ?? DEFAULT_COLORS[0]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points and labels */}
        {points.map((p, i) => {
          const dataPoint = data[i];
          if (!dataPoint) return null;
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill={dataPoint.color}
                className="cursor-pointer hover:r-6 transition-all"
                onClick={() => onPointClick?.(i, dataPoint)}
              />
              {showValues && (
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  className="text-xs fill-zinc-600 dark:fill-zinc-400"
                >
                  {formatValue(dataPoint.value)}
                </text>
              )}
              <text
                x={p.x}
                y={height - CHART_PADDING.bottom + 15}
                textAnchor="middle"
                className="text-xs fill-zinc-500"
              >
                {dataPoint.label.length > 8 ? `${dataPoint.label.slice(0, 8)}...` : dataPoint.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  },
);

LineChart.displayName = 'LineChart';

// ============================================================================
// Main Component
// ============================================================================

const ChartWidgetComponent: React.FC<WidgetRendererProps<ChartWidgetData>> = ({
  widget,
  onAction,
}) => {
  const {
    chartType,
    data,
    title,
    xAxisLabel,
    yAxisLabel,
    showLegend = true,
    showValues = true,
  } = widget;

  // Prepare data with colors
  const chartData: ChartDataPoint[] = useMemo(() => {
    return data.map((point, i) => ({
      ...point,
      color: getColor(i, point.color),
    }));
  }, [data]);

  // Handle click events
  const handleClick = useCallback(
    (index: number, point: ChartDataPoint) => {
      onAction?.({
        widgetId: widget.id,
        action: 'point-click',
        payload: { index, label: point.label, value: point.value },
      });
    },
    [widget.id, onAction],
  );

  // Chart dimensions (responsive)
  const width = 400;
  const height = CHART_HEIGHT;

  return (
    <div className="space-y-2">
      {title && (
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 text-center">
          {title}
        </h4>
      )}

      <div className="flex items-center justify-center">
        {yAxisLabel && (
          <span className="text-xs text-zinc-500 -rotate-90 origin-center mr-2">{yAxisLabel}</span>
        )}

        <div className="overflow-x-auto">
          {chartType === 'bar' && (
            <BarChart
              data={chartData}
              width={width}
              height={height}
              showValues={showValues}
              onBarClick={handleClick}
            />
          )}

          {chartType === 'line' && (
            <LineChart
              data={chartData}
              width={width}
              height={height}
              showValues={showValues}
              onPointClick={handleClick}
            />
          )}

          {chartType === 'area' && (
            <LineChart
              data={chartData}
              width={width}
              height={height}
              showValues={showValues}
              filled
              onPointClick={handleClick}
            />
          )}

          {chartType === 'pie' && (
            <PieChart
              data={chartData}
              width={width}
              height={height}
              showLegend={showLegend}
              onSliceClick={handleClick}
            />
          )}
        </div>
      </div>

      {xAxisLabel && <p className="text-xs text-zinc-500 text-center">{xAxisLabel}</p>}
    </div>
  );
};

ChartWidgetComponent.displayName = 'ChartWidget';

export const ChartWidget = memo(ChartWidgetComponent);

// Register the widget
WidgetRegistry.register({
  type: 'chart',
  displayName: 'Chart',
  component: ChartWidget as React.ComponentType<any>,
  icon: BarChart2,
});
