import React from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  EFFORT_DESCRIPTION,
  EFFORT_LABEL,
  getModelReasoning,
  type Effort,
  type ModelReasoning,
} from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const EFFORT_STEP_ORDER = Object.keys(EFFORT_LABEL) as Effort[];

const CAPSULE_HEIGHT = 44;
const PILL_INSET = 4;
const STEP_DOT_SIZE = 6;

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

interface EffortSliderProps {
  steps: readonly Effort[];
  value: Effort | undefined;
  onChange: (effort: Effort) => void;
  testID: string;
}

export function EffortSlider({ steps, value, onChange, testID }: EffortSliderProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const description = value ? EFFORT_DESCRIPTION[value] : undefined;

  const select = (effort: Effort) => {
    if (effort === value) return;
    if (hapticsEnabled) void Haptics.selectionAsync();
    onChange(effort);
  };

  return (
    <View testID={testID}>
      <View
        testID={`${testID}-capsule`}
        style={{
          height: CAPSULE_HEIGHT,
          borderRadius: CAPSULE_HEIGHT / 2,
          padding: PILL_INSET,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceHover,
        }}
      >
        {steps.map((effort) => {
          const label = EFFORT_LABEL[effort];
          const active = effort === value;
          return (
            <PressableBox
              key={effort}
              testID={`${testID}-${effort}`}
              onPress={() => select(effort)}
              hitSlop={{ top: PILL_INSET, bottom: PILL_INSET }}
              accessibilityRole="button"
              accessibilityLabel={`Reasoning effort ${label}`}
              accessibilityHint={EFFORT_DESCRIPTION[effort]}
              accessibilityState={{ selected: active }}
              style={{
                flexGrow: active ? 0 : 1,
                flexShrink: active ? 0 : 1,
                flexBasis: active ? 'auto' : 0,
                height: CAPSULE_HEIGHT - PILL_INSET * 2,
                borderRadius: (CAPSULE_HEIGHT - PILL_INSET * 2) / 2,
                paddingHorizontal: active ? 18 : 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? colors.textPrimary : colors.transparent,
              }}
            >
              {active ? (
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.background,
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                  }}
                >
                  {label}
                </Text>
              ) : (
                <View
                  testID={`${testID}-${effort}-dot`}
                  style={{
                    width: STEP_DOT_SIZE,
                    height: STEP_DOT_SIZE,
                    borderRadius: STEP_DOT_SIZE / 2,
                    backgroundColor: colors.textMuted,
                  }}
                />
              )}
            </PressableBox>
          );
        })}
      </View>
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
