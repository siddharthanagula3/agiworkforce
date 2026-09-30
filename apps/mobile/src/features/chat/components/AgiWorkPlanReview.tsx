import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Plus, RotateCcw, X } from 'lucide-react-native';
import { AGIWORK_PLAN_MAX_STEPS, MAX_AGIWORK_PLAN_STEP_CHARS } from '@agiworkforce/cloud-contracts';
import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { AgiWorkPlanDecision, AgiWorkPlanStep } from '@/src/features/chat/utils/agiWorkPlan';

const LABEL = {
  heading: 'Plan',
  explanation: 'Edit any step before the work starts. The agent follows the plan you start here.',
  addStep: 'Add a step',
  removeStep: 'Remove this step',
  start: 'Start work',
  cancel: 'Cancel',
  empty: 'Add at least one step, or cancel.',
  retryFrom: 'Retry from this step',
} as const;

const STATUS_LABEL: Record<AgiWorkPlanStep['status'], string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export function AgiWorkPlanReview({
  steps,
  awaitingApproval,
  runFinished,
  busy,
  onDecision,
}: {
  steps: readonly AgiWorkPlanStep[];
  awaitingApproval: boolean;
  runFinished: boolean;
  busy: boolean;
  onDecision: (decision: AgiWorkPlanDecision) => void;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState(() => steps.map((step) => step.description));

  useEffect(() => {
    setDraft(steps.map((step) => step.description));
  }, [steps]);

  const retryIndex = runFinished
    ? steps.findIndex((step) => step.status === 'failed' || step.status === 'cancelled')
    : -1;

  if (!awaitingApproval && retryIndex < 0) return null;

  const frame = {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.lg,
    borderCurve: 'continuous' as const,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  };

  if (!awaitingApproval) {
    const step = steps[retryIndex]!;
    return (
      <View testID="agiwork-plan-retry" accessibilityLabel="Retry a step" style={frame}>
        <Text style={{ fontSize: typeScale.footnote, color: colors.textPrimary }}>
          {retryIndex + 1}. {step.description}
          <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>
            {' · '}
            {STATUS_LABEL[step.status]}
          </Text>
        </Text>
        <PressableBox
          disabled={busy}
          onPress={() => onDecision({ kind: 'retry', fromIndex: retryIndex })}
          accessibilityRole="button"
          accessibilityLabel={LABEL.retryFrom}
          accessibilityState={{ disabled: busy }}
          testID="agiwork-plan-retry-step"
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            minHeight: 36,
            paddingHorizontal: 12,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            opacity: busy ? 0.6 : 1,
          })}
        >
          <RotateCcw size={14} color={colors.textPrimary} />
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textPrimary }}
          >
            {LABEL.retryFrom}
          </Text>
        </PressableBox>
      </View>
    );
  }

  const cleaned = draft.map((description) => description.trim()).filter(Boolean);
  const ready = cleaned.length > 0;

  return (
    <View testID="agiwork-plan-review" accessibilityLabel="Review the plan" style={frame}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}>
          {LABEL.heading}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {LABEL.explanation}
        </Text>
      </View>
      {draft.map((description, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text
            style={{
              width: 18,
              marginTop: 10,
              fontSize: typeScale.caption,
              color: colors.textMuted,
            }}
          >
            {index + 1}.
          </Text>
          <TextInput
            value={description}
            multiline
            maxLength={MAX_AGIWORK_PLAN_STEP_CHARS}
            editable={!busy}
            accessibilityLabel={`Step ${index + 1}`}
            onChangeText={(text) =>
              setDraft((current) =>
                current.map((value, position) => (position === index ? text : value)),
              )
            }
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.teal}
            style={{
              flex: 1,
              minHeight: 44,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              fontSize: typeScale.subhead,
              textAlignVertical: 'top',
            }}
          />
          <PressableBox
            disabled={busy || draft.length <= 1}
            onPress={() =>
              setDraft((current) => current.filter((_, position) => position !== index))
            }
            accessibilityRole="button"
            accessibilityLabel={LABEL.removeStep}
            accessibilityState={{ disabled: busy || draft.length <= 1 }}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: radii.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
              opacity: busy || draft.length <= 1 ? 0.4 : 1,
            })}
          >
            <X size={16} color={colors.textMuted} />
          </PressableBox>
        </View>
      ))}
      {draft.length < AGIWORK_PLAN_MAX_STEPS ? (
        <PressableBox
          disabled={busy}
          onPress={() => setDraft((current) => [...current, ''])}
          accessibilityRole="button"
          accessibilityLabel={LABEL.addStep}
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            minHeight: 36,
            paddingHorizontal: 8,
            borderRadius: radii.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            opacity: busy ? 0.6 : 1,
          })}
        >
          <Plus size={14} color={colors.textPrimary} />
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textPrimary }}
          >
            {LABEL.addStep}
          </Text>
        </PressableBox>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button
          title={LABEL.start}
          size="sm"
          disabled={!ready || busy}
          onPress={() => onDecision({ kind: 'start', steps: cleaned })}
          testID="agiwork-plan-start"
        />
        <Button
          title={LABEL.cancel}
          size="sm"
          variant="outline"
          disabled={busy}
          onPress={() => onDecision({ kind: 'cancel' })}
          testID="agiwork-plan-cancel"
        />
        {!ready ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            {LABEL.empty}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
