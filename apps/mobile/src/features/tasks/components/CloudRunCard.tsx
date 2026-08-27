import { View, Pressable } from 'react-native';
import { Bot, ChevronRight, Clock3 } from 'lucide-react-native';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { getManagedDisplayName } from '@/src/features/model-picker/service';
import { useThemeColors } from '@/src/ui/theme';
import {
  cloudRunBlock,
  cloudRunStateColor,
  cloudRunTimeLabel,
  CLOUD_RUN_ORIGIN_LABELS,
  CLOUD_RUN_STATE_LABELS,
  CLOUD_RUN_WORK_MODE_LABELS,
} from '../runPresentation';

const BLOCK_LABELS: Record<NonNullable<ReturnType<typeof cloudRunBlock>>, string> = {
  approval: 'Waiting for your approval',
  input: 'Waiting for connector input',
};

function Chip({ label }: { label: string }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: colors.neutralSurface,
        borderWidth: 1,
        borderColor: colors.neutralBorder,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function CloudRunCard({
  run,
  title,
  onPress,
}: {
  run: CloudAgentRun;
  title: string;
  onPress: (runId: string) => void;
}) {
  const colors = useThemeColors();
  const stateColor = cloudRunStateColor(run.state, colors);
  const block = cloudRunBlock(run);
  const timeLabel = cloudRunTimeLabel(run);
  const originLabel = CLOUD_RUN_ORIGIN_LABELS[run.originSurface];
  const stateLabel = CLOUD_RUN_STATE_LABELS[run.state];

  return (
    <Pressable
      onPress={() => onPress(run.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}. ${stateLabel}. Started on ${originLabel}`}
      style={{
        minHeight: 92,
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 15,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: block ? colors.warningBorder : colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: block ? colors.warningSurface : colors.neutralSurface,
          }}
        >
          {block ? <Clock3 size={18} color={stateColor} /> : <Bot size={18} color={stateColor} />}
        </View>

        <View style={{ flex: 1, gap: 8 }}>
          <Text numberOfLines={2} style={{ color: colors.textPrimary, fontWeight: '600' }}>
            {title}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: stateColor }} />
            <Text style={{ color: stateColor, fontSize: 12, fontWeight: '600' }}>{stateLabel}</Text>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
              · {getManagedDisplayName(run.model)}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Chip label={originLabel} />
            <Chip label={CLOUD_RUN_WORK_MODE_LABELS[run.workMode]} />
            {timeLabel ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{timeLabel}</Text>
            ) : null}
          </View>

          {block ? (
            <Text style={{ color: colors.agentWarning, fontSize: 12, fontWeight: '600' }}>
              {BLOCK_LABELS[block]}
            </Text>
          ) : null}
        </View>

        <ChevronRight size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}
