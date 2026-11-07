import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from 'recharts';
import { chartHoverText, formatChartShare, type ChartChrome, type ChartSpec } from './chart-spec';

const AXIS_FONT_SIZE_PX = 11;
const LABELED_X_AXIS_HEIGHT_PX = 48;
const GRID_DASH = '3 3';
const LINE_STROKE_WIDTH = 2;
const PIE_OUTER_RADIUS = '75%';
const DONUT_INNER_RADIUS = '50%';
const DONUT_LABEL_FONT_SIZE_PX = 14;
const PIE_CENTER = '50%';
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
const TOOLTIP_RADIUS_PX = 8;
const DEFAULT_SERIES_KEY = 'value';

function yDomain(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  return Math.ceil(max * 1.1);
}

function ChartHover({
  active,
  label,
  payload,
  chrome,
}: {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{
    value?: string | number;
    name?: string | number;
    dataKey?: string | number;
  }>;
  chrome: ChartChrome;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      data-testid="chart-hover"
      className="rounded-md border px-3 py-2 text-xs"
      style={{ backgroundColor: chrome.surface, borderColor: chrome.border, color: chrome.text }}
    >
      {payload.length === 1
        ? chartHoverText(label, payload[0]?.value)
        : payload.map((entry, index) => (
            <p key={entry.dataKey ?? index}>
              {chartHoverText(`${label ?? ''} · ${entry.name ?? entry.dataKey ?? ''}`, entry.value)}
            </p>
          ))}
    </div>
  );
}

export interface ChartCanvasProps {
  spec: ChartSpec;
  palette: readonly string[];
  chrome: ChartChrome;
  animate: boolean;
}

export default function ChartCanvas({ spec, palette, chrome, animate }: ChartCanvasProps) {
  const { kind, rows, xKey, series, showLegend } = spec;
  const colorAt = (index: number, override?: string) =>
    override ?? palette[index % palette.length]!;

  const axisTick = { fill: chrome.axis, fontSize: AXIS_FONT_SIZE_PX };
  const xLabel = spec.xLabel
    ? {
        value: spec.xLabel,
        position: 'insideBottom' as const,
        fill: chrome.axis,
        fontSize: AXIS_FONT_SIZE_PX,
      }
    : undefined;
  const yLabel = spec.yLabel
    ? {
        value: spec.yLabel,
        position: 'insideLeft' as const,
        angle: -90,
        fill: chrome.axis,
        fontSize: AXIS_FONT_SIZE_PX,
      }
    : undefined;
  const tooltipStyles = {
    contentStyle: {
      background: chrome.surface,
      border: `1px solid ${chrome.border}`,
      borderRadius: TOOLTIP_RADIUS_PX,
      color: chrome.text,
      fontSize: AXIS_FONT_SIZE_PX,
    },
    labelStyle: { color: chrome.label },
    itemStyle: { color: chrome.text },
  };
  const legendStyle = { color: chrome.label, fontSize: AXIS_FONT_SIZE_PX };
  const shareLabel = ({ x, y, textAnchor, percent }: PieLabelRenderProps) => (
    <text
      data-chart-share=""
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fill={chrome.label}
      fontSize={DONUT_LABEL_FONT_SIZE_PX}
    >
      {formatChartShare(percent ?? 0)}
    </text>
  );

  const chart =
    kind === 'bar' ? (
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={chrome.grid} />
        <XAxis
          dataKey={xKey}
          tick={axisTick}
          stroke={chrome.grid}
          label={xLabel}
          height={xLabel ? LABELED_X_AXIS_HEIGHT_PX : undefined}
        />
        <YAxis
          tick={axisTick}
          stroke={chrome.grid}
          label={yLabel}
          domain={[0, yDomain]}
          allowDecimals={false}
        />
        <Tooltip
          {...tooltipStyles}
          content={<ChartHover chrome={chrome} />}
          cursor={{ fill: chrome.hover }}
        />
        {showLegend && <Legend wrapperStyle={legendStyle} />}
        {series.map((entry, index) => (
          <Bar
            key={entry.dataKey}
            dataKey={entry.dataKey}
            name={entry.name ?? entry.dataKey}
            fill={colorAt(index, entry.color)}
            radius={BAR_RADIUS}
            isAnimationActive={animate}
          />
        ))}
      </BarChart>
    ) : kind === 'line' ? (
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={chrome.grid} />
        <XAxis
          dataKey={xKey}
          tick={axisTick}
          stroke={chrome.grid}
          label={xLabel}
          height={xLabel ? LABELED_X_AXIS_HEIGHT_PX : undefined}
        />
        <YAxis
          tick={axisTick}
          stroke={chrome.grid}
          label={yLabel}
          domain={[0, yDomain]}
          allowDecimals={false}
        />
        <Tooltip {...tooltipStyles} content={<ChartHover chrome={chrome} />} />
        {showLegend && <Legend wrapperStyle={legendStyle} />}
        {series.map((entry, index) => (
          <Line
            key={entry.dataKey}
            type="monotone"
            dataKey={entry.dataKey}
            name={entry.name ?? entry.dataKey}
            stroke={colorAt(index, entry.color)}
            strokeWidth={LINE_STROKE_WIDTH}
            dot={false}
            isAnimationActive={animate}
          />
        ))}
      </LineChart>
    ) : (
      <PieChart>
        <Pie
          data={rows}
          dataKey={series[0]?.dataKey ?? DEFAULT_SERIES_KEY}
          nameKey={xKey}
          cx={PIE_CENTER}
          cy={PIE_CENTER}
          outerRadius={PIE_OUTER_RADIUS}
          {...(spec.donut ? { innerRadius: DONUT_INNER_RADIUS, label: shareLabel } : {})}
          isAnimationActive={animate}
        >
          {rows.map((row, index) => (
            <Cell key={String(row[xKey] ?? index)} fill={colorAt(index, series[0]?.color)} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyles} />
        {showLegend && <Legend wrapperStyle={legendStyle} itemSorter={null} />}
      </PieChart>
    );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  );
}
