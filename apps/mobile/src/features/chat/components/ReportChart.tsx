import { useRef, useState, type RefObject } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import type { ColorScheme } from '@/src/ui/theme';
import { exportPngImage, shareFile } from '@/services/fileCreation';
import {
  describeChart,
  formatChartValue,
  type MermaidChart,
  type PieChart,
  type XyChart,
} from '@/src/features/chat/utils/mermaidChart';
import { typeScale } from '@/src/ui/theme/tokens';

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

function seriesLabel(chart: XyChart, index: number): string {
  const series = chart.series[index]!;
  return series.name ?? `${series.type === 'bar' ? 'Bars' : 'Line'} ${index + 1}`;
}

function selectionReadout(chart: MermaidChart, selected: number): string {
  if (chart.kind === 'pie') {
    const slice = chart.slices[selected];
    if (!slice) return '';
    const total = chart.slices.reduce((sum, entry) => sum + entry.value, 0);
    return `${slice.label}: ${formatChartValue(slice.value)} (${formatChartValue((slice.value / total) * 100)}%)`;
  }
  const category = chart.categories[selected];
  if (category === undefined) return '';
  const values = chart.series.map(
    (series, index) =>
      `${seriesLabel(chart, index)} ${formatChartValue(series.values[selected] ?? 0)}`,
  );
  return `${category}: ${values.join(', ')}`;
}

function chartTable(chart: MermaidChart): { header: string[]; rows: string[][] } {
  if (chart.kind === 'pie') {
    return {
      header: ['Label', 'Value'],
      rows: chart.slices.map((slice) => [slice.label, formatChartValue(slice.value)]),
    };
  }
  return {
    header: ['', ...chart.series.map((_, index) => seriesLabel(chart, index))],
    rows: chart.categories.map((category, row) => [
      category,
      ...chart.series.map((series) => formatChartValue(series.values[row] ?? 0)),
    ]),
  };
}

function ChartDataTable({ chart, colors }: { chart: MermaidChart; colors: ColorScheme }) {
  const { header, rows } = chartTable(chart);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: 6 }}>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 4 }}>
        {[header, ...rows].map((row, rowIndex) => (
          <View
            key={`row-${rowIndex}`}
            style={{
              flexDirection: 'row',
              backgroundColor: rowIndex === 0 ? colors.surfaceHover : undefined,
              borderTopWidth: rowIndex === 0 ? 0 : 1,
              borderTopColor: colors.borderLight,
            }}
          >
            {row.map((cell, cellIndex) => (
              <Text
                key={`cell-${rowIndex}-${cellIndex}`}
                selectable
                style={{
                  width: 110,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  fontSize: typeScale.caption,
                  fontWeight: rowIndex === 0 ? '600' : '400',
                  color: rowIndex === 0 ? colors.textPrimary : colors.textSecondary,
                  textAlign: cellIndex === 0 ? 'left' : 'right',
                }}
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
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
          <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const EXPORT_SCALE = 3;

function XyChartView({
  chart,
  colors,
  selected,
  onSelect,
  svgRef,
}: {
  chart: XyChart;
  colors: ColorScheme;
  selected: number | null;
  onSelect: (index: number) => void;
  svgRef: RefObject<Svg | null>;
}) {
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
  const legend = chart.series.map((_, index) => ({
    label: seriesLabel(chart, index),
    color: colorAt(palette, index),
  }));

  return (
    <>
      <View style={{ width: '100%', aspectRatio: XY_WIDTH / XY_HEIGHT }}>
        <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${XY_WIDTH} ${XY_HEIGHT}`}>
          <Rect x={0} y={0} width={XY_WIDTH} height={XY_HEIGHT} fill={colors.surfaceBase} />
          {selected !== null ? (
            <Rect
              x={PLOT_LEFT + band * selected}
              y={PLOT_TOP}
              width={band}
              height={plotHeight}
              fill={colors.accentSurface}
            />
          ) : null}
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
          {chart.categories.map((category, index) => (
            <Rect
              key={`hit-${category}-${index}`}
              x={PLOT_LEFT + band * index}
              y={PLOT_TOP}
              width={band}
              height={plotHeight + PLOT_BOTTOM}
              fill={colors.transparent}
              onPress={() => onSelect(index)}
            />
          ))}
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
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{chart.yLabel}</Text>
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

function PieChartView({
  chart,
  colors,
  selected,
  onSelect,
  svgRef,
}: {
  chart: PieChart;
  colors: ColorScheme;
  selected: number | null;
  onSelect: (index: number) => void;
  svgRef: RefObject<Svg | null>;
}) {
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
        <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}>
          <Rect x={0} y={0} width={PIE_SIZE} height={PIE_SIZE} fill={colors.surfaceBase} />
          {arcs.length === 1 ? (
            <Circle
              cx={PIE_SIZE / 2}
              cy={PIE_SIZE / 2}
              r={PIE_RADIUS}
              fill={arcs[0]!.color}
              onPress={() => onSelect(0)}
            />
          ) : (
            arcs.map((arc, index) => (
              <Path
                key={`${arc.slice.label}-${arc.start}`}
                d={arcPath(arc.start, arc.end)}
                fill={arc.color}
                stroke={selected === index ? colors.textPrimary : colors.surfaceBase}
                strokeWidth={selected === index ? 2 : 1}
                onPress={() => onSelect(index)}
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

function chartImageSize(chart: MermaidChart): { width: number; height: number } {
  return chart.kind === 'pie'
    ? { width: PIE_SIZE * EXPORT_SCALE, height: PIE_SIZE * EXPORT_SCALE }
    : { width: XY_WIDTH * EXPORT_SCALE, height: XY_HEIGHT * EXPORT_SCALE };
}

export function ReportChart({ chart, colors }: { chart: MermaidChart; colors: ColorScheme }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showData, setShowData] = useState(false);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<Svg>(null);
  const select = (index: number) => setSelected((current) => (current === index ? null : index));
  const readout = selected === null ? null : selectionReadout(chart, selected);
  const chartName = chart.title || 'Chart';

  const saveImage = () => {
    const svg = svgRef.current;
    if (!svg || saving) return;
    setSaving(true);
    svg.toDataURL((base64) => {
      void exportPngImage(base64, chartName)
        .then((uri) => shareFile(uri))
        .catch(() => {
          Alert.alert('Could not save the chart', 'Try again in a moment.');
        })
        .finally(() => setSaving(false));
    }, chartImageSize(chart));
  };

  return (
    <View
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
      <View accessible accessibilityRole="image" accessibilityLabel={describeChart(chart)}>
        {chart.title ? (
          <Text
            style={{
              fontSize: typeScale.footnote,
              fontWeight: '600',
              color: colors.textPrimary,
              marginBottom: 6,
            }}
          >
            {chart.title}
          </Text>
        ) : null}
        {chart.kind === 'pie' ? (
          <PieChartView
            chart={chart}
            colors={colors}
            selected={selected}
            onSelect={select}
            svgRef={svgRef}
          />
        ) : (
          <XyChartView
            chart={chart}
            colors={colors}
            selected={selected}
            onSelect={select}
            svgRef={svgRef}
          />
        )}
      </View>
      {readout ? (
        <Text
          style={{ fontSize: typeScale.caption, color: colors.textPrimary, marginTop: 6 }}
          accessibilityLiveRegion="polite"
        >
          {readout}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <PressableBox
          onPress={() => setShowData((shown) => !shown)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showData }}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
          >
            {showData ? 'Hide data' : 'Show data'}
          </Text>
        </PressableBox>
        <PressableBox
          onPress={saveImage}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={`Save ${chartName} as an image`}
          accessibilityState={{ disabled: saving, busy: saving }}
          style={{ minHeight: 44, justifyContent: 'center', opacity: saving ? 0.55 : 1 }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
          >
            {saving ? 'Saving…' : 'Save image'}
          </Text>
        </PressableBox>
      </View>
      {showData ? <ChartDataTable chart={chart} colors={colors} /> : null}
    </View>
  );
}
