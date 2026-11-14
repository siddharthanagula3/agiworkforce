import { useMemo } from 'react';
import { View } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';
import type { CloudCodeChanges } from '@agiworkforce/cloud-contracts';
import { CLOUD_CODE_SESSION_COPY } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  cloudCodeChangeTotals,
  cloudCodeFileCountLabel,
  cloudCodeChangeCountsLabel,
} from '../presentation';
import { CloudCodeLineCountsText } from './CloudCodeChangesCard';
import { SessionComposerField } from './SessionComposerField';

const SEND_LABEL = 'Send to this session';
const INPUT_LABEL = 'Message for this session';

export function CloudCodeComposer({
  value,
  working,
  stopping,
  detail,
  optionsLabel,
  onChangeText,
  onSend,
  onStop,
  onOpenOptions,
  changes,
  onOpenChanges,
}: {
  value: string;
  working: boolean;
  stopping: boolean;
  detail: string;
  optionsLabel: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  onOpenOptions: () => void;
  changes?: CloudCodeChanges | null;
  onOpenChanges?: () => void;
}) {
  const colors = useThemeColors();
  const empty = value.trim().length === 0;
  const totals = useMemo(
    () => (changes ? cloudCodeChangeTotals(changes.files, changes.diff) : null),
    [changes],
  );

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, gap: 6 }}>
      {totals && totals.files > 0 && onOpenChanges ? (
        <Pressable
          onPress={onOpenChanges}
          testID="cloud-code-changes-pill"
          accessibilityRole="button"
          accessibilityLabel={`${cloudCodeFileCountLabel(totals.files)} changed. ${cloudCodeChangeCountsLabel(totals)}`}
          style={{
            minHeight: 36,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
            {cloudCodeFileCountLabel(totals.files)}
          </Text>
          <CloudCodeLineCountsText counts={totals} />
        </Pressable>
      ) : null}
      <SessionComposerField
        value={value}
        placeholder={
          working
            ? CLOUD_CODE_SESSION_COPY.runningPlaceholder
            : CLOUD_CODE_SESSION_COPY.composerPlaceholder
        }
        inputLabel={INPUT_LABEL}
        primaryState={working ? 'streaming' : 'idle'}
        primaryDisabled={working ? stopping : empty}
        primaryLabel={
          working
            ? stopping
              ? CLOUD_CODE_SESSION_COPY.stoppingTurn
              : CLOUD_CODE_SESSION_COPY.stopTurn
            : SEND_LABEL
        }
        onChangeText={onChangeText}
        onPrimary={working ? onStop : onSend}
      />
      <Pressable
        onPress={onOpenOptions}
        accessibilityRole="button"
        accessibilityLabel={`${optionsLabel}. ${detail}`}
        style={{
          minHeight: 32,
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 16,
          paddingRight: 8,
        }}
      >
        <SlidersHorizontal size={13} color={colors.textMuted} />
        <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
          {detail}
        </Text>
      </Pressable>
    </View>
  );
}
