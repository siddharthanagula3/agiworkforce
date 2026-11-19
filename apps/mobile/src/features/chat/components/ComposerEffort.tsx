import { useMemo } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { EFFORT_LABEL, getModelReasoning, type Effort } from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { EffortGauge } from '@/src/features/model-picker/components/EffortGauge';
import {
  EffortLevelName,
  EffortTrack,
  effortStepsFor,
  resolveEffortStep,
  useScopedEffort,
} from '@/src/features/model-picker/components/EffortSlider';
import { useThemeColors, radii } from '@/src/ui/theme';
import {
  COMPOSER_ACTION_CIRCLE_SIZE,
  COMPOSER_CONTROL_SIZE,
  COMPOSER_GLYPH_SIZE,
} from './composerMetrics';

export function useComposerEffort(modelId: string, conversationId: string | undefined) {
  const reasoning = useMemo(() => getModelReasoning(modelId), [modelId]);
  const steps = useMemo(() => effortStepsFor(reasoning), [reasoning]);
  const [stored, select] = useScopedEffort(conversationId);
  const value = resolveEffortStep(steps, stored, reasoning);
  return { steps, value, select };
}

export function ComposerEffortButton({ effort, onPress }: { effort: Effort; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <PressableBox
      testID="chat.composer.effort"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Reasoning effort: ${EFFORT_LABEL[effort]}`}
      accessibilityHint="Opens the effort slider"
      style={({ pressed }) => ({
        width: COMPOSER_CONTROL_SIZE,
        height: COMPOSER_CONTROL_SIZE,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
    >
      <EffortGauge
        testID="chat.composer.effort-gauge"
        effort={effort}
        size={COMPOSER_GLYPH_SIZE}
        color={colors.textSecondary}
      />
    </PressableBox>
  );
}

interface ComposerEffortPanelProps {
  steps: readonly Effort[];
  value: Effort;
  onChange: (effort: Effort) => void;
  onDone: () => void;
}

export function ComposerEffortPanel({ steps, value, onChange, onDone }: ComposerEffortPanelProps) {
  const colors = useThemeColors();
  return (
    <View testID="chat.composer.effort-panel" style={{ paddingBottom: 6 }}>
      <EffortLevelName effort={value} testID="chat.composer.effort-level" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ flex: 1 }}>
          <EffortTrack
            testID="chat.composer.effort-slider"
            steps={steps}
            value={value}
            onChange={onChange}
          />
        </View>
        <PressableBox
          testID="chat.composer.effort-done"
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityHint="Closes the effort slider and returns to the message"
          style={{
            width: COMPOSER_CONTROL_SIZE,
            height: COMPOSER_CONTROL_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            testID="chat.composer.effort-done-circle"
            style={{
              width: COMPOSER_ACTION_CIRCLE_SIZE,
              height: COMPOSER_ACTION_CIRCLE_SIZE,
              borderRadius: radii.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.textPrimary,
            }}
          >
            <Check size={18} color={colors.surfaceElevated} />
          </View>
        </PressableBox>
      </View>
    </View>
  );
}
