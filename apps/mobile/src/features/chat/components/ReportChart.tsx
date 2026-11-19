import { useRef, useState, type RefObject } from 'react';
import {
  Alert,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { exportPngImage, shareFile } from '@/services/fileCreation';
import {
  describeChart,
  formatChartTick,
  formatChartValue,
  pieTotal,
  slicePercent,
  xySeriesLabel,
  type MermaidChart,
  type PieChart,
  type XyChart,
} from '@/src/features/chat/utils/mermaidChart';
import { typeScale } from '@/src/ui/theme/tokens';
import { SideScroller } from './SideScroller';

const XY_WIDTH = 320;
const XY_HEIGHT = 200;
const PLOT_RIGHT = 8;
const Y_TICKS = 4;
const MAX_LABEL_CHARS = 10;
const GLYPH_WIDTH_EMS = 0.6;
const CATEGORY_LABEL_EMS = 6;
const PIE_SIZE = 200;
const PIE_RADIUS = 90;
const DONUT_HOLE = 0.58;
const MIN_LABELLED_SWEEP = 0.35;
const PIE_WIDTH_SHARE = 0.6;
const SHADE_OPACITY = 0.5;
const EXPORT_WIDTH = 320;
const EXPORT_PADDING = 12;
const EXPORT_TITLE_HEIGHT = 24;
const EXPORT_LINE_HEIGHT = 18;
const EXPORT_SWATCH = 10;
const EXPORT_TITLE_CHARS = 44;
const EXPORT_LABEL_CHARS = 40;
const EXPORT_AXIS_FONT = 11;
const EXPORT_SCALE = 3;
const ASCII_NAME = /[A-Za-z0-9]/;
const UNTITLED_FILE_NAME = 'chart';

interface SeriesPaint {
  color: string;
  opacity: number;
}

function basePalette(colors: ColorScheme): string[] {
  return [
    colors.agentActive,
    colors.agentSuccess,
    colors.agentWarning,
    colors.agentThinking,
    colors.agentError,
    colors.textSecondary,
  ];
}

export function chartSeriesColor(colors: ColorScheme, index: number): string {
  const palette = basePalette(colors);
  return palette[index % palette.length]!;
}

function paintAt(colors: ColorScheme, index: number, explicit?: string): SeriesPaint {
  if (explicit) return { color: explicit, opacity: 1 };
  const palette = basePalette(colors);
  const round = Math.floor(index / palette.length);
  return {
    color: palette[index % palette.length]!,
    opacity: round % 2 === 0 ? 1 : SHADE_OPACITY,
  };
}

function truncate(label: string, limit: number): string {
  return label.length > limit ? `${label.slice(0, limit - 1)}…` : label;
}

function showsXyLegend(chart: XyChart): boolean {
  return chart.showLegend ?? (chart.series.length > 1 || chart.series.some((s) => s.name));
}

function showsPieLegend(chart: PieChart): boolean {
  return chart.showLegend ?? true;
}

export function chartFileName(chart: MermaidChart): string {
  return chart.title && ASCII_NAME.test(chart.title) ? chart.title : UNTITLED_FILE_NAME;
}

function selectionReadout(chart: MermaidChart, selected: number): string {
  if (chart.kind === 'pie') {
    const slice = chart.slices[selected];
    if (!slice) return '';
    return `${slice.label}: ${formatChartValue(slice.value)} (${slicePercent(chart, slice.value)}%)`;
  }
  const category = chart.categories[selected];
  if (category === undefined) return '';
  const values = chart.series.map((series, index) => {
    const value = series.values[selected];
    return `${xySeriesLabel(chart, index)} ${typeof value === 'number' ? formatChartValue(value) : 'no value'}`;
  });
  return `${category}: ${values.join(', ')}`;
}

function chartTable(chart: MermaidChart): { header: string[]; rows: string[][] } {
  if (chart.kind === 'pie') {
    return {
      header: [chart.categoryHeader ?? 'Label', chart.valueHeader ?? 'Value'],
      rows: chart.slices.map((slice) => [slice.label, formatChartValue(slice.value)]),
    };
  }
  return {
    header: [
      chart.categoryHeader ?? '',
      ...chart.series.map((_, index) => xySeriesLabel(chart, index)),
    ],
    rows: chart.categories.map((category, row) => [
      category,
      ...chart.series.map((series) => {
        const value = series.values[row];
        return typeof value === 'number' ? formatChartValue(value) : '';
      }),
    ]),
  };
}

function ChartDataTable({ chart, colors }: { chart: MermaidChart; colors: ColorScheme }) {
  const { header, rows } = chartTable(chart);
  return (
    <SideScroller showsHorizontalScrollIndicator style={{ marginTop: 6 }}>
      <View
        testID="report-chart-data"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 4 }}
      >
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
    </SideScroller>
  );
}

interface LegendEntry {
  label: string;
  color: string;
  opacity: number;
}

function Legend({ entries, colors }: { entries: LegendEntry[]; colors: ColorScheme }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
      {entries.map((entry, index) => (
        <View
          key={`${entry.label}-${entry.color}-${index}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: entry.color,
              opacity: entry.opacity,
            }}
          />
          <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
            {entry.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function xyLegendEntries(chart: XyChart, colors: ColorScheme): LegendEntry[] {
  return chart.series.map((series, index) => ({
    label: xySeriesLabel(chart, index),
    ...paintAt(colors, index, series.color),
  }));
}

interface XyGeometry {
  width: number;
  height: number;
  fontSize: number;
}

function plottedValues(chart: XyChart): number[] {
  return chart.series.flatMap((series) =>
    series.values.filter((value): value is number => typeof value === 'number'),
  );
}

function lineSegments(values: ReadonlyArray<number | null>): Array<Array<[number, number]>> {
  const segments: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  values.forEach((value, index) => {
    if (typeof value === 'number') {
      current.push([index, value]);
      return;
    }
    if (current.length > 0) segments.push(current);
    current = [];
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

function xyLayout(chart: XyChart, { width, height, fontSize }: XyGeometry) {
  const values = plottedValues(chart);
  const low = chart.yRange?.min ?? Math.min(0, ...values);
  const rawHigh = chart.yRange?.max ?? Math.max(0, ...values);
  const high = rawHigh > low ? rawHigh : low + 1;
  const ticks = Array.from(
    { length: Y_TICKS + 1 },
    (_, tick) => low + ((high - low) * tick) / Y_TICKS,
  );
  const tickChars = Math.max(...ticks.map((tick) => formatChartTick(tick).length));
  const plotLeft = Math.ceil(tickChars * fontSize * GLYPH_WIDTH_EMS) + 6;
  const plotTop = Math.ceil(fontSize / 2) + 2;
  const plotBottom = Math.ceil(fontSize * 1.4) + 6;
  const plotWidth = Math.max(1, width - plotLeft - PLOT_RIGHT);
  const plotHeight = Math.max(1, height - plotTop - plotBottom);
  const band = plotWidth / Math.max(1, chart.categories.length);
  const maxLabels = Math.max(2, Math.floor(plotWidth / (fontSize * CATEGORY_LABEL_EMS)));
  const y = (value: number) =>
    plotTop +
    plotHeight -
    ((Math.min(high, Math.max(low, value)) - low) / (high - low)) * plotHeight;
  return {
    ticks,
    plotLeft,
    plotTop,
    plotWidth,
    plotHeight,
    band,
    labelEvery: Math.ceil(chart.categories.length / maxLabels),
    y,
    baseline: y(Math.min(high, Math.max(low, 0))),
  };
}

function XyPlot({
  chart,
  colors,
  selected,
  geometry,
}: {
  chart: XyChart;
  colors: ColorScheme;
  selected: number | null;
  geometry: XyGeometry;
}) {
  const { width, height, fontSize } = geometry;
  const layout = xyLayout(chart, geometry);
  const { plotLeft, plotTop, plotHeight, band, y, baseline } = layout;
  const bars = chart.series.filter((series) => series.type === 'bar');
  const barWidth = (band * 0.7) / Math.max(1, bars.length);

  return (
    <>
      <Rect x={0} y={0} width={width} height={height} fill={colors.surfaceBase} />
      {selected !== null ? (
        <Rect
          x={plotLeft + band * selected}
          y={plotTop}
          width={band}
          height={plotHeight}
          fill={colors.accentSurface}
        />
      ) : null}
      {layout.ticks.map((value, tick) => {
        const tickY = y(value);
        return (
          <G key={`tick-${tick}`}>
            <Line
              x1={plotLeft}
              x2={width - PLOT_RIGHT}
              y1={tickY}
              y2={tickY}
              stroke={colors.borderLight}
              strokeWidth={0.5}
            />
            <SvgText
              x={plotLeft - 4}
              y={tickY + fontSize / 3}
              fontSize={fontSize}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {formatChartTick(value)}
            </SvgText>
          </G>
        );
      })}
      {chart.series.map((series, seriesIndex) => {
        const paint = paintAt(colors, seriesIndex, series.color);
        const centre = (index: number) => plotLeft + band * index + band / 2;
        if (series.type === 'line') {
          return (
            <G key={`series-${seriesIndex}`}>
              {lineSegments(series.values).map((segment, segmentIndex) => (
                <Polyline
                  key={`segment-${seriesIndex}-${segmentIndex}`}
                  points={segment.map(([index, value]) => `${centre(index)},${y(value)}`).join(' ')}
                  fill="none"
                  stroke={paint.color}
                  strokeOpacity={paint.opacity}
                  strokeWidth={2}
                />
              ))}
              {series.values.map((value, index) =>
                typeof value === 'number' ? (
                  <Circle
                    key={`point-${seriesIndex}-${index}`}
                    cx={centre(index)}
                    cy={y(value)}
                    r={2.5}
                    fill={paint.color}
                    fillOpacity={paint.opacity}
                  />
                ) : null,
              )}
            </G>
          );
        }
        const barIndex = bars.indexOf(series);
        return (
          <G key={`series-${seriesIndex}`}>
            {series.values.map((value, index) => {
              if (typeof value !== 'number') return null;
              const top = y(value);
              return (
                <Rect
                  key={`bar-${seriesIndex}-${index}`}
                  testID={`chart-bar-${seriesIndex}-${index}`}
                  x={plotLeft + band * index + band * 0.15 + barWidth * barIndex}
                  y={Math.min(top, baseline)}
                  width={barWidth}
                  height={Math.max(1, Math.abs(baseline - top))}
                  fill={paint.color}
                  fillOpacity={paint.opacity}
                />
              );
            })}
          </G>
        );
      })}
      <Line
        x1={plotLeft}
        x2={width - PLOT_RIGHT}
        y1={baseline}
        y2={baseline}
        stroke={colors.border}
        strokeWidth={1}
      />
      {chart.categories.map((category, index) =>
        index % layout.labelEvery === 0 ? (
          <SvgText
            key={`category-${index}`}
            x={plotLeft + band * index + band / 2}
            y={plotTop + plotHeight + fontSize + 4}
            fontSize={fontSize}
            fill={colors.textMuted}
            textAnchor="middle"
          >
            {truncate(category, MAX_LABEL_CHARS)}
          </SvgText>
        ) : null,
      )}
    </>
  );
}

function categoryAt(chart: XyChart, geometry: XyGeometry, x: number): number | null {
  const layout = xyLayout(chart, geometry);
  const index = Math.floor((x - layout.plotLeft) / layout.band);
  if (!Number.isFinite(index)) return null;
  return Math.min(chart.categories.length - 1, Math.max(0, index));
}

function XyChartView({
  chart,
  colors,
  selected,
  onSelect,
  onScrub,
}: {
  chart: XyChart;
  colors: ColorScheme;
  selected: number | null;
  onSelect: (index: number) => void;
  onScrub: (index: number) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(XY_WIDTH);
  const geometry: XyGeometry = {
    width,
    height: Math.round((width * XY_HEIGHT) / XY_WIDTH),
    fontSize: typeScale.caption * fontScale,
  };
  const onLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0 && measured !== width) setWidth(measured);
  };
  const pick = (event: GestureResponderEvent) =>
    categoryAt(chart, geometry, event.nativeEvent.locationX);

  return (
    <>
      <View onLayout={onLayout} style={{ width: '100%', height: geometry.height }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
          <XyPlot chart={chart} colors={colors} selected={selected} geometry={geometry} />
        </Svg>
        <View
          testID="report-chart-scrub"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => true}
          onResponderGrant={(event) => {
            const index = pick(event);
            if (index !== null) onSelect(index);
          }}
          onResponderMove={(event) => {
            const index = pick(event);
            if (index !== null) onScrub(index);
          }}
        />
      </View>
      {chart.xLabel ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted, textAlign: 'center' }}>
          {chart.xLabel}
        </Text>
      ) : null}
      {chart.yLabel ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{chart.yLabel}</Text>
      ) : null}
      {showsXyLegend(chart) ? (
        <Legend entries={xyLegendEntries(chart, colors)} colors={colors} />
      ) : null}
    </>
  );
}

function point(radius: number, angle: number) {
  const center = PIE_SIZE / 2;
  return { x: center + radius * Math.sin(angle), y: center - radius * Math.cos(angle) };
}

function arcPath(startAngle: number, endAngle: number, hole: number): string {
  const center = PIE_SIZE / 2;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = point(PIE_RADIUS, startAngle);
  const outerEnd = point(PIE_RADIUS, endAngle);
  if (hole <= 0) {
    return `M ${center} ${center} L ${outerStart.x} ${outerStart.y} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} Z`;
  }
  const inner = PIE_RADIUS * hole;
  const innerStart = point(inner, endAngle);
  const innerEnd = point(inner, startAngle);
  return `M ${outerStart.x} ${outerStart.y} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerStart.x} ${innerStart.y} A ${inner} ${inner} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y} Z`;
}

function pieArcs(chart: PieChart, colors: ColorScheme) {
  const total = pieTotal(chart);
  let angle = 0;
  return chart.slices.map((slice, index) => {
    const sweep = total > 0 ? (Math.max(0, slice.value) / total) * Math.PI * 2 : 0;
    const start = angle;
    angle += sweep;
    const percent = slicePercent(chart, slice.value);
    return {
      index,
      slice,
      start,
      end: angle,
      sweep,
      percent,
      ...paintAt(colors, index),
      label: chart.showValues
        ? `${slice.label} ${formatChartValue(slice.value)} (${percent}%)`
        : `${slice.label} ${percent}%`,
    };
  });
}

function PiePlot({
  chart,
  colors,
  selected,
  onSelect,
  labelSize,
}: {
  chart: PieChart;
  colors: ColorScheme;
  selected: number | null;
  onSelect?: (index: number) => void;
  labelSize: number;
}) {
  const arcs = pieArcs(chart, colors).filter((arc) => arc.sweep > 0);
  const hole = chart.donut ? DONUT_HOLE : 0;
  const ringRadius = (PIE_RADIUS * (1 + hole)) / 2;
  return (
    <>
      <Rect x={0} y={0} width={PIE_SIZE} height={PIE_SIZE} fill={colors.surfaceBase} />
      {arcs.length === 1 && !chart.donut ? (
        <Circle
          cx={PIE_SIZE / 2}
          cy={PIE_SIZE / 2}
          r={PIE_RADIUS}
          fill={arcs[0]!.color}
          fillOpacity={arcs[0]!.opacity}
          onPress={onSelect ? () => onSelect(arcs[0]!.index) : undefined}
        />
      ) : arcs.length === 1 ? (
        <Circle
          cx={PIE_SIZE / 2}
          cy={PIE_SIZE / 2}
          r={ringRadius}
          fill="none"
          stroke={arcs[0]!.color}
          strokeOpacity={arcs[0]!.opacity}
          strokeWidth={PIE_RADIUS * (1 - hole)}
          onPress={onSelect ? () => onSelect(arcs[0]!.index) : undefined}
        />
      ) : (
        arcs.map((arc) => (
          <Path
            key={`${arc.slice.label}-${arc.start}`}
            d={arcPath(arc.start, arc.end, hole)}
            fill={arc.color}
            fillOpacity={arc.opacity}
            stroke={selected === arc.index ? colors.textPrimary : colors.surfaceBase}
            strokeWidth={selected === arc.index ? 2 : 1}
            onPress={onSelect ? () => onSelect(arc.index) : undefined}
          />
        ))
      )}
      {chart.donut
        ? arcs
            .filter((arc) => arc.sweep >= MIN_LABELLED_SWEEP)
            .map((arc) => {
              const at = point(ringRadius, arc.start + arc.sweep / 2);
              return (
                <SvgText
                  key={`share-${arc.index}`}
                  x={at.x}
                  y={at.y + labelSize / 3}
                  fontSize={labelSize}
                  fontWeight="600"
                  fill={colors.surfaceBase}
                  textAnchor="middle"
                >
                  {`${arc.percent}%`}
                </SvgText>
              );
            })
        : null}
    </>
  );
}

function PieChartView({
  chart,
  colors,
  selected,
  onSelect,
}: {
  chart: PieChart;
  colors: ColorScheme;
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(XY_WIDTH);
  if (pieTotal(chart) <= 0) {
    return (
      <Text
        style={{ fontSize: typeScale.footnote, color: colors.textSecondary, paddingVertical: 8 }}
      >
        Nothing to plot. Every value in this chart is zero or less.
      </Text>
    );
  }
  const rendered = width * PIE_WIDTH_SHARE;
  const labelSize = (typeScale.caption * fontScale * PIE_SIZE) / Math.max(1, rendered);
  return (
    <>
      <View
        onLayout={(event) => {
          const measured = Math.round(event.nativeEvent.layout.width);
          if (measured > 0 && measured !== width) setWidth(measured);
        }}
        style={{ width: '100%' }}
      >
        <View
          style={{
            width: `${PIE_WIDTH_SHARE * 100}%` as const,
            aspectRatio: 1,
            alignSelf: 'center',
          }}
        >
          <Svg width="100%" height="100%" viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`}>
            <PiePlot
              chart={chart}
              colors={colors}
              selected={selected}
              onSelect={onSelect}
              labelSize={labelSize}
            />
          </Svg>
        </View>
      </View>
      {showsPieLegend(chart) ? (
        <Legend
          entries={pieArcs(chart, colors).map((arc) => ({
            label: arc.label,
            color: arc.color,
            opacity: arc.opacity,
          }))}
          colors={colors}
        />
      ) : null}
    </>
  );
}

function exportLegendEntries(chart: MermaidChart, colors: ColorScheme): LegendEntry[] {
  if (chart.kind === 'pie') {
    return showsPieLegend(chart)
      ? pieArcs(chart, colors).map((arc) => ({
          label: arc.label,
          color: arc.color,
          opacity: arc.opacity,
        }))
      : [];
  }
  return showsXyLegend(chart) ? xyLegendEntries(chart, colors) : [];
}

function exportLayout(chart: MermaidChart, colors: ColorScheme) {
  const plot =
    chart.kind === 'pie'
      ? { width: PIE_SIZE, height: PIE_SIZE }
      : { width: XY_WIDTH, height: XY_HEIGHT };
  const legend = exportLegendEntries(chart, colors);
  const notes =
    chart.kind === 'xy'
      ? [chart.xLabel, chart.yLabel].filter((note): note is string => !!note)
      : [];
  const titleHeight = chart.title ? EXPORT_TITLE_HEIGHT : 0;
  const plotTop = EXPORT_PADDING + titleHeight;
  const notesTop = plotTop + plot.height;
  const legendTop =
    notesTop + notes.length * EXPORT_LINE_HEIGHT + (legend.length > 0 ? EXPORT_PADDING / 2 : 0);
  return {
    plot,
    legend,
    notes,
    plotTop,
    notesTop,
    legendTop,
    width: EXPORT_WIDTH,
    height: legendTop + legend.length * EXPORT_LINE_HEIGHT + EXPORT_PADDING,
  };
}

function ChartExportSvg({
  chart,
  colors,
  svgRef,
}: {
  chart: MermaidChart;
  colors: ColorScheme;
  svgRef: RefObject<Svg | null>;
}) {
  const layout = exportLayout(chart, colors);
  const plotX = (layout.width - layout.plot.width) / 2;
  const drawable = chart.kind === 'xy' || pieTotal(chart) > 0;
  return (
    <View
      testID="report-chart-export"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        aspectRatio: layout.width / layout.height,
        opacity: 0,
      }}
    >
      <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${layout.width} ${layout.height}`}>
        <Rect x={0} y={0} width={layout.width} height={layout.height} fill={colors.surfaceBase} />
        {chart.title ? (
          <SvgText
            x={EXPORT_PADDING}
            y={EXPORT_PADDING + 14}
            fontSize={13}
            fontWeight="600"
            fill={colors.textPrimary}
          >
            {truncate(chart.title, EXPORT_TITLE_CHARS)}
          </SvgText>
        ) : null}
        {drawable ? (
          <G transform={`translate(${plotX} ${layout.plotTop})`}>
            {chart.kind === 'pie' ? (
              <PiePlot chart={chart} colors={colors} selected={null} labelSize={EXPORT_AXIS_FONT} />
            ) : (
              <XyPlot
                chart={chart}
                colors={colors}
                selected={null}
                geometry={{ width: XY_WIDTH, height: XY_HEIGHT, fontSize: EXPORT_AXIS_FONT }}
              />
            )}
          </G>
        ) : null}
        {layout.notes.map((note, index) => (
          <SvgText
            key={`note-${index}`}
            x={EXPORT_PADDING}
            y={layout.notesTop + index * EXPORT_LINE_HEIGHT + 12}
            fontSize={10}
            fill={colors.textMuted}
          >
            {truncate(note, EXPORT_LABEL_CHARS)}
          </SvgText>
        ))}
        {layout.legend.map((entry, index) => {
          const rowTop = layout.legendTop + index * EXPORT_LINE_HEIGHT;
          return (
            <G key={`${entry.label}-${entry.color}-${index}`}>
              <Rect
                x={EXPORT_PADDING}
                y={rowTop + (EXPORT_LINE_HEIGHT - EXPORT_SWATCH) / 2}
                width={EXPORT_SWATCH}
                height={EXPORT_SWATCH}
                rx={2}
                fill={entry.color}
                fillOpacity={entry.opacity}
              />
              <SvgText
                x={EXPORT_PADDING + EXPORT_SWATCH + 6}
                y={rowTop + 13}
                fontSize={11}
                fill={colors.textSecondary}
              >
                {truncate(entry.label, EXPORT_LABEL_CHARS)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

function chartImageSize(
  chart: MermaidChart,
  colors: ColorScheme,
): { width: number; height: number } {
  const layout = exportLayout(chart, colors);
  return { width: layout.width * EXPORT_SCALE, height: layout.height * EXPORT_SCALE };
}

function plottedCount(chart: MermaidChart): number {
  return chart.kind === 'pie' ? chart.slices.length : chart.categories.length;
}

export function ReportChart({ chart, colors }: { chart: MermaidChart; colors: ColorScheme }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showData, setShowData] = useState(false);
  const [saving, setSaving] = useState(false);
  const svgRef = useRef<Svg>(null);
  const select = (index: number) => setSelected((current) => (current === index ? null : index));
  const scrub = (index: number) => setSelected(index);
  const readout = selected === null ? null : selectionReadout(chart, selected);
  const chartName = chart.title || 'Chart';
  const shown = plottedCount(chart);
  const truncated = chart.totalRows !== undefined && chart.totalRows > shown;

  const saveImage = () => {
    const svg = svgRef.current;
    if (!svg || saving) return;
    setSaving(true);
    svg.toDataURL(
      (base64) => {
        void exportPngImage(base64, chartFileName(chart))
          .then((uri) => shareFile(uri))
          .catch(() => {
            Alert.alert('Could not save the chart', 'Try again in a moment.');
          })
          .finally(() => setSaving(false));
      },
      chartImageSize(chart, colors),
    );
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
      <View
        testID="report-chart-figure"
        accessible
        accessibilityRole="image"
        accessibilityLabel={describeChart(chart)}
      >
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
          <PieChartView chart={chart} colors={colors} selected={selected} onSelect={select} />
        ) : (
          <XyChartView
            chart={chart}
            colors={colors}
            selected={selected}
            onSelect={select}
            onScrub={scrub}
          />
        )}
      </View>
      {truncated ? (
        <Text
          testID="report-chart-truncation"
          style={{ fontSize: typeScale.caption, color: colors.textMuted, marginTop: 6 }}
        >
          {`Plotting the first ${shown} of ${chart.totalRows} points.`}
        </Text>
      ) : null}
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
          onPress={() => setShowData((shownData) => !shownData)}
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
      <ChartExportSvg chart={chart} colors={colors} svgRef={svgRef} />
    </View>
  );
}
