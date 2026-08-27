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
} from 'recharts';
import type { ChartChrome, ChartSpec } from './chart-spec';

const AXIS_FONT_SIZE_PX = 11;
const GRID_DASH = '3 3';
const LINE_STROKE_WIDTH = 2;
const PIE_OUTER_RADIUS = '75%';
const PIE_CENTER = '50%';
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
const TOOLTIP_RADIUS_PX = 8;
const DEFAULT_SERIES_KEY = 'value';

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

  const chart =
    kind === 'bar' ? (
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={chrome.grid} />
        <XAxis dataKey={xKey} tick={axisTick} stroke={chrome.grid} />
        <YAxis tick={axisTick} stroke={chrome.grid} />
        <Tooltip {...tooltipStyles} cursor={{ fill: chrome.hover }} />
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
        <XAxis dataKey={xKey} tick={axisTick} stroke={chrome.grid} />
        <YAxis tick={axisTick} stroke={chrome.grid} />
        <Tooltip {...tooltipStyles} />
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
          isAnimationActive={animate}
        >
          {rows.map((row, index) => (
            <Cell key={String(row[xKey] ?? index)} fill={colorAt(index, series[0]?.color)} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyles} />
        {showLegend && <Legend wrapperStyle={legendStyle} />}
      </PieChart>
    );

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  );
}
