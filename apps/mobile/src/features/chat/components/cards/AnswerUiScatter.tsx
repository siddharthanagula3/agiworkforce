import { useState, type ReactNode } from 'react';
import {
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { formatAnswerUiNumber } from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { chartSeriesColor } from '../ReportChart';
import {
  answerUiScatterAxis,
  describeAnswerUiScatter,
  type AnswerUiScatterSeries,
} from './answer-ui';

export const ANSWER_UI_SCATTER_FAILED_LABEL =
  'This chart could not be drawn. The data table below has its values.';
export const ANSWER_UI_SCATTER_SHOW_DATA = 'Show data';
export const ANSWER_UI_SCATTER_HIDE_DATA = 'Hide data';

const PLOT_WIDTH = 320;
const PLOT_HEIGHT = 200;
const PLOT_RIGHT = 8;
const TICKS = 4;
const GLYPH_WIDTH_EMS = 0.6;
const POINT_RADIUS = 4;
const SELECTED_RADIUS = 6;
const TARGET = 44;

interface Selection {
  series: number;
  point: number;
}

function scatterLayout(series: readonly AnswerUiScatterSeries[], width: number, fontSize: number) {
  const points = series.flatMap((entry) => entry.points);
  const xAxis = answerUiScatterAxis(
    points.map((point) => point.x),
    TICKS,
  );
  const yAxis = answerUiScatterAxis(
    points.map((point) => point.y),
    TICKS,
  );
  const height = Math.round((width * PLOT_HEIGHT) / PLOT_WIDTH);
  const tickChars = Math.max(...yAxis.ticks.map((tick) => formatAnswerUiNumber(tick).length));
  const plotLeft = Math.ceil(tickChars * fontSize * GLYPH_WIDTH_EMS) + spacing.sm;
  const plotTop = Math.ceil(fontSize / 2) + 2;
  const plotBottom = Math.ceil(fontSize * 1.4) + spacing.sm;
  const plotWidth = Math.max(1, width - plotLeft - PLOT_RIGHT);
  const plotHeight = Math.max(1, height - plotTop - plotBottom);
  const x = (value: number) =>
    plotLeft + ((value - xAxis.low) / (xAxis.high - xAxis.low)) * plotWidth;
  const y = (value: number) =>
    plotTop + plotHeight - ((value - yAxis.low) / (yAxis.high - yAxis.low)) * plotHeight;
  return { width, height, plotLeft, plotTop, plotHeight, xAxis, yAxis, x, y };
}

function nearestPoint(
  series: readonly AnswerUiScatterSeries[],
  layout: ReturnType<typeof scatterLayout>,
  touchX: number,
  touchY: number,
): Selection | null {
  let best: Selection | null = null;
  let bestDistance = TARGET;
  for (const [seriesIndex, entry] of series.entries()) {
    for (const [pointIndex, point] of entry.points.entries()) {
      const distance = Math.hypot(layout.x(point.x) - touchX, layout.y(point.y) - touchY);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { series: seriesIndex, point: pointIndex };
      }
    }
  }
  return best;
}

export function AnswerUiScatter({
  title,
  xLabel,
  yLabel,
  series,
  colors,
  dataTable,
}: {
  title: string;
  xLabel?: string;
  yLabel?: string;
  series: readonly AnswerUiScatterSeries[];
  colors: ColorScheme;
  dataTable: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(PLOT_WIDTH);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [showData, setShowData] = useState(false);
  const drawable = series.some((entry) => entry.points.length > 0);
  const fontSize = typeScale.caption * fontScale;
  const layout = scatterLayout(series, width, fontSize);
  const selectedPoint = selected ? series[selected.series]?.points[selected.point] : undefined;

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    if (measured > 0 && measured !== width) setWidth(measured);
  };
  const pick = (event: GestureResponderEvent) => {
    const hit = nearestPoint(
      series,
      layout,
      event.nativeEvent.locationX,
      event.nativeEvent.locationY,
    );
    setSelected((current) =>
      hit && current && current.series === hit.series && current.point === hit.point ? null : hit,
    );
  };

  return (
    <View
      testID="answer-ui-scatter"
      style={{
        padding: spacing.md,
        gap: spacing.xs,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.borderLight,
        backgroundColor: colors.surfaceBase,
      }}
    >
      <View
        testID="answer-ui-scatter-figure"
        accessible
        accessibilityRole="image"
        accessibilityLabel={describeAnswerUiScatter(title, series)}
      >
        <Text
          style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.textPrimary }}
        >
          {title}
        </Text>
        {drawable ? (
          <View onLayout={onLayout} style={{ width: '100%', height: layout.height }}>
            <Svg width="100%" height="100%" viewBox={`0 0 ${layout.width} ${layout.height}`}>
              {layout.yAxis.ticks.map((tick) => (
                <G key={`y-${tick}`}>
                  <Line
                    x1={layout.plotLeft}
                    x2={layout.width - PLOT_RIGHT}
                    y1={layout.y(tick)}
                    y2={layout.y(tick)}
                    stroke={colors.borderLight}
                    strokeWidth={0.5}
                  />
                  <SvgText
                    x={layout.plotLeft - 4}
                    y={layout.y(tick) + fontSize / 3}
                    fontSize={fontSize}
                    fill={colors.textMuted}
                    textAnchor="end"
                  >
                    {formatAnswerUiNumber(tick)}
                  </SvgText>
                </G>
              ))}
              {layout.xAxis.ticks.map((tick) => (
                <G key={`x-${tick}`}>
                  <Line
                    x1={layout.x(tick)}
                    x2={layout.x(tick)}
                    y1={layout.plotTop}
                    y2={layout.plotTop + layout.plotHeight}
                    stroke={colors.borderLight}
                    strokeWidth={0.5}
                  />
                  <SvgText
                    x={layout.x(tick)}
                    y={layout.plotTop + layout.plotHeight + fontSize + 4}
                    fontSize={fontSize}
                    fill={colors.textMuted}
                    textAnchor="middle"
                  >
                    {formatAnswerUiNumber(tick)}
                  </SvgText>
                </G>
              ))}
              {series.map((entry, seriesIndex) => (
                <G key={`series-${seriesIndex}`}>
                  {entry.points.map((point, pointIndex) => {
                    const isSelected =
                      selected?.series === seriesIndex && selected.point === pointIndex;
                    return (
                      <Circle
                        key={`point-${seriesIndex}-${pointIndex}`}
                        testID={`answer-ui-scatter-point-${seriesIndex}-${pointIndex}`}
                        cx={layout.x(point.x)}
                        cy={layout.y(point.y)}
                        r={isSelected ? SELECTED_RADIUS : POINT_RADIUS}
                        fill={chartSeriesColor(colors, seriesIndex)}
                      />
                    );
                  })}
                </G>
              ))}
            </Svg>
            <View
              testID="answer-ui-scatter-touch"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onStartShouldSetResponder={() => true}
              onResponderTerminationRequest={() => true}
              onResponderGrant={pick}
            />
          </View>
        ) : (
          <Text
            testID="answer-ui-scatter-failed"
            style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
          >
            {ANSWER_UI_SCATTER_FAILED_LABEL}
          </Text>
        )}
        {xLabel ? (
          <Text
            style={{ fontSize: typeScale.caption, color: colors.textMuted, textAlign: 'center' }}
          >
            {xLabel}
          </Text>
        ) : null}
        {yLabel ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{yLabel}</Text>
        ) : null}
      </View>
      {series.length > 1 ? (
        <View
          testID="answer-ui-scatter-legend"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}
        >
          {series.map((entry, index) => (
            <View
              key={`${entry.name}-${index}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
            >
              <View
                style={{
                  width: spacing.md,
                  height: spacing.md,
                  borderRadius: spacing.md / 2,
                  backgroundColor: chartSeriesColor(colors, index),
                }}
              />
              <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
                {entry.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {selected && selectedPoint ? (
        <Text
          testID="answer-ui-scatter-readout"
          accessibilityLiveRegion="polite"
          style={{ fontSize: typeScale.caption, color: colors.textPrimary }}
        >
          {`${series[selected.series]!.name}: ${xLabel ?? 'x'} ${formatAnswerUiNumber(selectedPoint.x)}, ${yLabel ?? 'y'} ${formatAnswerUiNumber(selectedPoint.y)}`}
        </Text>
      ) : null}
      {drawable ? (
        <PressableBox
          onPress={() => setShowData((shown) => !shown)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showData }}
          style={{ minHeight: TARGET, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
          >
            {showData ? ANSWER_UI_SCATTER_HIDE_DATA : ANSWER_UI_SCATTER_SHOW_DATA}
          </Text>
        </PressableBox>
      ) : null}
      {showData || !drawable ? dataTable : null}
    </View>
  );
}
