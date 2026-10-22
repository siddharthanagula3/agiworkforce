import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  CLOUD_CODE_CHANGES_CARD_PREVIEW_ROWS,
  cloudCodeAddedLabel,
  cloudCodeChangeCountsLabel,
  cloudCodeChangeTotals,
  cloudCodeFilesChangedLabel,
  cloudCodeLineCountsByPath,
  cloudCodeRemovedLabel,
  cloudCodeViewMoreFilesLabel,
  type CloudCodeLineCounts,
} from '../presentation';

const CHEVRON_SIZE = 16;

export function CloudCodeLineCountsText({
  counts,
  testID,
}: {
  counts: CloudCodeLineCounts;
  testID?: string;
}) {
  const colors = useThemeColors();

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={cloudCodeChangeCountsLabel(counts)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Text variant="mono" style={{ color: colors.agentSuccess, fontSize: typeScale.subhead }}>
        {cloudCodeAddedLabel(counts.added)}
      </Text>
      <Text variant="mono" style={{ color: colors.agentError, fontSize: typeScale.subhead }}>
        {cloudCodeRemovedLabel(counts.removed)}
      </Text>
    </View>
  );
}

export function CloudCodeChangesCard({
  changes,
  onOpen,
}: {
  changes: CloudCodeChanges | null;
  onOpen: () => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  const totals = useMemo(
    () => cloudCodeChangeTotals(changes?.files ?? [], changes?.diff ?? ''),
    [changes],
  );
  const counts = useMemo(() => cloudCodeLineCountsByPath(changes?.diff ?? ''), [changes]);
  const files = changes?.files ?? [];

  if (files.length === 0) return null;

  const visible = files.slice(0, CLOUD_CODE_CHANGES_CARD_PREVIEW_ROWS);
  const remaining = files.length - visible.length;
  const label = cloudCodeFilesChangedLabel(files.length);

  return (
    <View
      testID="cloud-code-changes-card"
      style={{
        borderRadius: radii['2xl'],
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <PressableBox
        onPress={() => setExpanded((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={label}
        style={{
          minHeight: 48,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: typeScale.callout,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
        <CloudCodeLineCountsText counts={totals} />
        <View style={{ transform: [{ rotate: expanded ? '0deg' : '-90deg' }] }}>
          <ChevronDown size={CHEVRON_SIZE} color={colors.textMuted} />
        </View>
      </PressableBox>

      {expanded
        ? visible.map((file) => {
            const own = counts.get(file.path);
            return (
              <PressableBox
                key={file.path}
                onPress={onOpen}
                accessibilityRole="button"
                accessibilityLabel={`${file.path}${own ? `. ${cloudCodeChangeCountsLabel(own)}` : ''}`}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Text
                  variant="mono"
                  numberOfLines={1}
                  ellipsizeMode="head"
                  style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.subhead }}
                >
                  {file.path}
                </Text>
                {own ? <CloudCodeLineCountsText counts={own} /> : null}
              </PressableBox>
            );
          })
        : null}

      {expanded && remaining > 0 ? (
        <PressableBox
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={cloudCodeViewMoreFilesLabel(remaining)}
          style={{
            minHeight: 48,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontSize: typeScale.subhead,
              fontWeight: '600',
            }}
          >
            {cloudCodeViewMoreFilesLabel(remaining)}
          </Text>
          <ChevronRight size={CHEVRON_SIZE} color={colors.textMuted} />
        </PressableBox>
      ) : null}
    </View>
  );
}
