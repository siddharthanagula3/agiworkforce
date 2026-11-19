import { useMemo } from 'react';
import { View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { readChartArtifact } from '@/src/features/chat/utils/chartArtifact';
import type { ChartSpec } from '@agiworkforce/types';
import { ReportChart } from './ReportChart';
import { SideScroller } from './SideScroller';

function counted(count: number, one: string, other: string): string {
  return `${count} ${count === 1 ? one : other}`;
}

export function chartArtifactSummary(spec: ChartSpec): { kind: string; counts: string } {
  const kind = spec.donut ? 'Donut' : `${spec.kind.charAt(0).toUpperCase()}${spec.kind.slice(1)}`;
  return {
    kind,
    counts: `${counted(spec.rows.length, 'point', 'points')} · ${counted(spec.series.length, 'series', 'series')}`,
  };
}

/** A chart artifact: its kind and size, then the chart, or the reason it cannot be plotted. */
export function ChartArtifactView({ content, colors }: { content: string; colors: ColorScheme }) {
  const reading = useMemo(() => readChartArtifact(content), [content]);

  if (!reading.ok) {
    return (
      <View testID="chart-artifact-fallback" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <BarChart3 size={14} color={colors.textMuted} />
          <Text
            accessibilityRole="alert"
            style={{ flex: 1, fontSize: typeScale.footnote, color: colors.textSecondary }}
          >
            {reading.reason}
          </Text>
        </View>
        <SideScroller showsHorizontalScrollIndicator>
          <Text
            selectable
            style={{
              fontFamily: codeFontFamily,
              fontSize: typeScale.caption,
              color: colors.textPrimary,
            }}
          >
            {content}
          </Text>
        </SideScroller>
      </View>
    );
  }

  const summary = chartArtifactSummary(reading.spec);
  return (
    <View testID="chart-artifact">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <BarChart3 size={14} color={colors.textMuted} />
        <Text
          style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textSecondary }}
        >
          {summary.kind}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {summary.counts}
        </Text>
      </View>
      <ReportChart chart={reading.chart} colors={colors} />
    </View>
  );
}
