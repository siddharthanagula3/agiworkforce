import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import type { ColorScheme } from '@/src/ui/theme';
import {
  describeChart,
  formatChartValue,
  type MermaidChart,
  type PieChart,
  type XyChart,
} from '@/src/features/chat/utils/mermaidChart';

const XY_WIDTH = 320;
const XY_HEIGHT = 200;
const PLOT_LEFT = 44;
const PLOT_RIGHT = 8;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 28;
const Y_TICKS = 4;
const MAX_CATEGORY_LABELS = 8;
const MAX_LABEL_CHARS = 10;
const PIE_SIZE = 200;
const PIE_RADIUS = 90;

function seriesPalette(colors: ColorScheme): string[] {
  return [
    colors.agentActive,
    colors.agentSuccess,
    colors.agentWarning,
    colors.agentThinking,
    colors.agentError,
    colors.textSecondary,
  ];
}

function colorAt(palette: readonly string[], index: number): string {
  return palette[index % palette.length]!;
}

function shortLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…` : label;
}

function Legend({
  entries,
  colors,
}: {
  entries: Array<{ label: string; color: string }>;
  colors: ColorScheme;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
      {entries.map((entry) => (
        <View
          key={`${entry.label}-${entry.color}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: entry.color }} />
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{entry.label}</Text>
        </View>
      ))}
    </View>
  );
}

function XyChartView({ chart, colors }: { chart: XyChart; colors: ColorScheme }) {
  const palette = seriesPalette(colors);
  const values = chart.series.flatMap((series) => series.values);
  const low = chart.yRange?.min ?? Math.min(0, ...values);
  const rawHigh = chart.yRange?.max ?? Math.max(0, ...values);
  const high = rawHigh > low ? rawHigh : low + 1;
  const plotWidth = XY_WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const plotHeight = XY_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const y = (value: number) =>
    PLOT_TOP +
    plotHeight -
    ((Math.min(high, Math.max(low, value)) - low) / (high - low)) * plotHeight;
  const band = plotWidth / chart.categories.length;
  const bars = chart.series.filter((series) => series.type === 'bar');
  const barWidth = (band * 0.7) / Math.max(1, bars.length);
  const baseline = y(Math.min(high, Math.max(low, 0)));
  const labelEvery = Math.ceil(chart.categories.length / MAX_CATEGORY_LABELS);
  const legend = chart.series.map((series, index) => ({
    label: series.name ?? `${series.type === 'bar' ? 'Bars' : 'Line'} ${index + 1}`,
    color: colorAt(palette, index),
  }));

  return (
    <>
      <View style={{ width: '100%', aspectRatio: XY_WIDTH / XY_HEIGHT }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${XY_WIDTH} ${XY_HEIGHT}`}>
          {Array.from({ length: Y_TICKS + 1 }, (_, tick) => {
            const value = low + ((high - low) * tick) / Y_TICKS;
            const tickY = y(value);
            return (
              <G key={`tick-${tick}`}>
                <Line
                  x1={PLOT_LEFT}
                  x2={XY_WIDTH - PLOT_RIGHT}
                  y1={tickY}
                  y2={tickY}
                  stroke={colors.borderLight}
                  strokeWidth={0.5}
                />
                <SvgText
                  x={PLOT_LEFT - 4}
                  y={tickY + 3}
                  fontSize={9}
                  fill={colors.textMuted}
                  textAnchor="end"
                >
                  {formatChartValue(value)}
                </SvgText>
              </G>
            );
          })}
          {chart.series.map((series, seriesIndex) => {
            const color = colorAt(palette, seriesIndex);
            if (series.type === 'line') {
              const points = series.values.map(
                (value, index) => `${PLOT_LEFT + band * index + band / 2},${y(value)}`,
              );
              return (
                <G key={`series-${seriesIndex}`}>
                  <Polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} />
                  {series.values.map((value, index) => (
                    <Circle
                      key={`point-${seriesIndex}-${index}`}
                      cx={PLOT_LEFT + band * index + band / 2}
                      cy={y(value)}
                      r={2.5}
                      fill={color}
                    />
                  ))}
                </G>
              );
            }
            const barIndex = bars.indexOf(series);
            return (
              <G key={`series-${seriesIndex}`}>
                {series.values.map((value, index) => {
                  const top = y(value);
                  return (
                    <Rect
                      key={`bar-${seriesIndex}-${index}`}
                      x={PLOT_LEFT + band * index + band * 0.15 + barWidth * barIndex}
                      y={Math.min(top, baseline)}
                      width={barWidth}
                      height={Math.max(1, Math.abs(baseline - top))}
                      fill={color}
                    />
                  );
                })}
              </G>
            );
          })}
          <Line
            x1={PLOT_LEFT}
            x2={XY_WIDTH - PLOT_RIGHT}
            y1={baseline}
            y2={baseline}
            stroke={colors.border}
            strokeWidth={1}
          />
          {chart.categories.map((category, index) =>
            index % labelEvery === 0 ? (
              <SvgText
                key={`category-${index}`}
                x={PLOT_LEFT + band * index + band / 2}
                y={XY_HEIGHT - PLOT_BOTTOM + 14}
                fontSize={9}
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {shortLabel(category)}
              </SvgText>
            ) : null,
          )}
        </Svg>
      </View>
      {chart.yLabel ? (
        <Text style={{ fontSize: 11, color: colors.textMuted }}>{chart.yLabel}</Text>
      ) : null}
      {legend.length > 1 || chart.series.some((series) => series.name) ? (
        <Legend entries={legend} colors={colors} />
      ) : null}
    </>
  );
}

function arcPath(startAngle: number, endAngle: number): string {
  const center = PIE_SIZE / 2;
  const start = {
    x: center + PIE_RADIUS * Math.sin(startAngle),
    y: center - PIE_RADIUS * Math.cos(startAngle),
  };
  const end = {
    x: center + PIE_RADIUS * Math.sin(endAngle),
    y: center - PIE_RADIUS * Math.cos(endAngle),
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${center} ${center} L ${start.x} ${start.y} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function PieChartView({ chart, colors }: { chart: PieChart; colors: ColorScheme }) {
  const palette = seriesPalette(colors);
  const total = chart.slices.reduce((sum, slice) => sum + slice.value, 0);
  let angle = 0;
  const arcs = chart.slices.map((slice, index) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { slice, start, end: angle, color: colorAt(palette, index) };
  });

  return (
    <>
      <View style={{ width: '60%', aspectRatio: 1, alignSelf: 'center' }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}>
          {arcs.length === 1 ? (
            <Circle cx={PIE_SIZE / 2} cy={PIE_SIZE / 2} r={PIE_RADIUS} fill={arcs[0]!.color} />
          ) : (
            arcs.map((arc) => (
              <Path
                key={`${arc.slice.label}-${arc.start}`}
                d={arcPath(arc.start, arc.end)}
                fill={arc.color}
                stroke={colors.surfaceBase}
                strokeWidth={1}
              />
            ))
          )}
        </Svg>
      </View>
      <Legend
        entries={arcs.map((arc) => ({
          label: `${arc.slice.label} ${formatChartValue((arc.slice.value / total) * 100)}%`,
          color: arc.color,
        }))}
        colors={colors}
      />
    </>
  );
}

export function ReportChart({ chart, colors }: { chart: MermaidChart; colors: ColorScheme }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeChart(chart)}
      testID="report-chart"
      style={{
        marginVertical: 8,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderLight,
        backgroundColor: colors.surfaceBase,
      }}
    >
      {chart.title ? (
        <Text
          style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 }}
        >
          {chart.title}
        </Text>
      ) : null}
      {chart.kind === 'pie' ? (
        <PieChartView chart={chart} colors={colors} />
      ) : (
        <XyChartView chart={chart} colors={colors} />
      )}
    </View>
  );
}
