import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import {
  EFFORT_DESCRIPTION,
  EFFORT_LABEL,
  getModelReasoning,
  type Effort,
  type ModelReasoning,
} from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import {
  COMPOSER_ACTION_CIRCLE_SIZE,
  COMPOSER_CONTROL_SIZE,
} from '@/src/features/chat/components/composerMetrics';
import { useThemeColors } from '@/src/ui/theme';
import { chatTypography, typeScale } from '@/src/ui/theme/tokens';

export const EFFORT_STEP_ORDER = Object.keys(EFFORT_LABEL) as Effort[];

const TRACK_HEIGHT = COMPOSER_ACTION_CIRCLE_SIZE;
const TRACK_TOUCH_HEIGHT = COMPOSER_CONTROL_SIZE;
const TRACK_INSET = 4;
const KNOB_SIZE = TRACK_HEIGHT - TRACK_INSET * 2;
const STEP_DOT_SIZE = 8;
const COVERED_DOT_OPACITY = 0.6;

export function effortStepsFor(reasoning: ModelReasoning): Effort[] {
  if (!reasoning.capable || reasoning.control !== 'effort_levels') return [];
  const supported = new Set(reasoning.supportedEfforts ?? []);
  return EFFORT_STEP_ORDER.filter((effort) => supported.has(effort));
}

export function effortStepsForModel(modelId: string): Effort[] {
  return effortStepsFor(getModelReasoning(modelId));
}

export function resolveEffortStep(
  steps: readonly Effort[],
  selected: Effort,
  reasoning: ModelReasoning,
): Effort | undefined {
  if (steps.includes(selected)) return selected;
  const fallback = reasoning.defaultEffort as Effort | undefined;
  return fallback && steps.includes(fallback) ? fallback : steps[0];
}

export const DEFAULT_EFFORT_SCOPE = '__default__';

export function useDefaultEffort(): Effort {
  return useAgentControlStore((s) => s.resolve(DEFAULT_EFFORT_SCOPE, null).effort);
}

export function setDefaultEffort(effort: Effort): void {
  useAgentControlStore.getState().setProjectDefault(DEFAULT_EFFORT_SCOPE, { effort });
}

export function useScopedEffort(
  conversationId: string | undefined,
): [Effort, (effort: Effort) => void] {
  const effort = useAgentControlStore(
    (s) => s.resolve(conversationId ?? DEFAULT_EFFORT_SCOPE, null).effort,
  );
  const select = useCallback(
    (next: Effort) => {
      if (conversationId) {
        useAgentControlStore.getState().setEffort(conversationId, next);
      } else {
        setDefaultEffort(next);
      }
    },
    [conversationId],
  );
  return [effort, select];
}

export function EffortLevelName({ effort, testID }: { effort: Effort; testID?: string }) {
  const colors = useThemeColors();
  return (
    <Text
      testID={testID}
      numberOfLines={1}
      accessibilityRole="header"
      style={{
        ...chatTypography.heading2,
        color: colors.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
      }}
    >
      {EFFORT_LABEL[effort]}
    </Text>
  );
}

interface EffortTrackProps {
  steps: readonly Effort[];
  value: Effort | undefined;
  onChange: (effort: Effort) => void;
  testID: string;
}

export function EffortTrack({ steps, value, onChange, testID }: EffortTrackProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [trackWidth, setTrackWidth] = useState(0);

  const activeIndex = value ? steps.indexOf(value) : -1;
  const travel = Math.max(trackWidth - TRACK_INSET * 2 - KNOB_SIZE, 0);
  const stepSpacing = steps.length > 1 ? travel / (steps.length - 1) : 0;

  const select = (effort: Effort) => {
    if (effort === value) return;
    if (hapticsEnabled) void Haptics.selectionAsync();
    onChange(effort);
  };

  const selectAt = (x: number) => {
    if (stepSpacing === 0) return;
    const nearest = Math.round((x - TRACK_INSET - KNOB_SIZE / 2) / stepSpacing);
    const effort = steps[Math.min(steps.length - 1, Math.max(0, nearest))];
    if (effort) select(effort);
  };

  const selectAtRef = useRef(selectAt);
  useEffect(() => {
    selectAtRef.current = selectAt;
  });
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`${testID}-drag`)
        .runOnJS(true)
        .activeOffsetX([-6, 6])
        .failOffsetY([-14, 14])
        .onUpdate((event) => selectAtRef.current(event.x)),
    [testID],
  );

  return (
    <GestureDetector gesture={drag}>
      <View
        testID={`${testID}-touch`}
        style={{ height: TRACK_TOUCH_HEIGHT, justifyContent: 'center' }}
      >
        <View
          testID={`${testID}-capsule`}
          onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
          style={{
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.surfaceHover,
            pointerEvents: 'none',
          }}
        >
          {activeIndex >= 0 && trackWidth > 0 ? (
            <View
              testID={`${testID}-fill`}
              style={{
                position: 'absolute',
                left: TRACK_INSET,
                top: TRACK_INSET,
                width: KNOB_SIZE + stepSpacing * activeIndex,
                height: KNOB_SIZE,
                borderRadius: KNOB_SIZE / 2,
                backgroundColor: colors.textPrimary,
              }}
            />
          ) : null}
          <View
            style={{
              position: 'absolute',
              left: TRACK_INSET,
              right: TRACK_INSET,
              top: 0,
              bottom: 0,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {steps.map((effort, index) => (
              <View key={effort} style={{ width: KNOB_SIZE, alignItems: 'center' }}>
                {index === activeIndex ? null : (
                  <View
                    testID={`${testID}-${effort}-dot`}
                    style={{
                      width: STEP_DOT_SIZE,
                      height: STEP_DOT_SIZE,
                      borderRadius: STEP_DOT_SIZE / 2,
                      backgroundColor: index < activeIndex ? colors.surfaceBase : colors.textMuted,
                      opacity: index < activeIndex ? COVERED_DOT_OPACITY : 1,
                    }}
                  />
                )}
              </View>
            ))}
          </View>
        </View>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            flexDirection: 'row',
          }}
        >
          {steps.map((effort) => (
            <PressableBox
              key={effort}
              testID={`${testID}-${effort}`}
              onPress={() => select(effort)}
              accessibilityRole="button"
              accessibilityLabel={`Reasoning effort ${EFFORT_LABEL[effort]}`}
              accessibilityHint={EFFORT_DESCRIPTION[effort]}
              accessibilityState={{ selected: effort === value }}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

interface EffortSliderProps extends EffortTrackProps {
  showDescription?: boolean;
}

export function EffortSlider({
  steps,
  value,
  onChange,
  testID,
  showDescription = true,
}: EffortSliderProps) {
  const colors = useThemeColors();
  const description = showDescription && value ? EFFORT_DESCRIPTION[value] : undefined;

  return (
    <View testID={testID}>
      {value ? <EffortLevelName effort={value} testID={`${testID}-level`} /> : null}
      <EffortTrack steps={steps} value={value} onChange={onChange} testID={testID} />
      {description ? (
        <Text
          testID={`${testID}-description`}
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            marginTop: 8,
            paddingHorizontal: 4,
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}
