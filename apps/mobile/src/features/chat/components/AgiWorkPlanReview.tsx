import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Plus,
  RotateCcw,
  Square,
  X,
} from 'lucide-react-native';
import { AGIWORK_PLAN_MAX_STEPS, MAX_AGIWORK_PLAN_STEP_CHARS } from '@agiworkforce/cloud-contracts';
import type { LifecycleStatus } from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { AgiWorkPlanDecision, AgiWorkPlanStep } from '@/src/features/chat/utils/agiWorkPlan';

const LABEL = {
  heading: 'Plan',
  explanation: 'Edit any step before you start. The agent follows this plan.',
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

const COMPLETED = 'completed' satisfies LifecycleStatus;
const FAILED = 'failed' satisfies LifecycleStatus;
const CANCELLED = 'cancelled' satisfies LifecycleStatus;

const GLYPH_SIZE = 16;

function PlanStepGlyph({ status }: { status: AgiWorkPlanStep['status'] }) {
  const colors = useThemeColors();
  if (status === 'in_progress') {
    return <ActivityIndicator size="small" color={colors.textSecondary} />;
  }
  if (status === COMPLETED) return <Check size={GLYPH_SIZE} color={colors.agentSuccess} />;
  if (status === FAILED) return <X size={GLYPH_SIZE} color={colors.agentError} />;
  if (status === CANCELLED) return <Square size={GLYPH_SIZE} color={colors.textMuted} />;
  return <Circle size={GLYPH_SIZE} color={colors.textMuted} />;
}

function PlanProgress({
  steps,
  runFinished,
}: {
  steps: readonly AgiWorkPlanStep[];
  runFinished: boolean;
}) {
  const colors = useThemeColors();
  const [choice, setChoice] = useState<boolean | null>(null);
  useEffect(() => {
    setChoice(null);
  }, [runFinished]);
  const expanded = choice ?? !runFinished;
  const done = steps.filter((step) => step.status === COMPLETED).length;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <View testID="agiwork-plan-progress">
      <PressableBox
        onPress={() => setChoice(!expanded)}
        accessibilityRole="button"
        accessibilityLabel={`Plan · ${done} of ${steps.length} done`}
        accessibilityState={{ expanded }}
        testID="agiwork-plan-toggle"
        style={{
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Chevron size={GLYPH_SIZE} color={colors.textMuted} />
        <Text style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}>
          {`Plan · ${done} of ${steps.length} done`}
        </Text>
      </PressableBox>
      {expanded
        ? steps.map((step, index) => (
            <View
              key={step.id}
              accessible
              accessibilityLabel={`${index + 1}. ${step.description}`}
              accessibilityValue={{ text: STATUS_LABEL[step.status] }}
              testID={`agiwork-plan-step-${index}`}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 }}
            >
              <View
                style={{
                  width: GLYPH_SIZE,
                  height: GLYPH_SIZE,
                  marginTop: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PlanStepGlyph status={step.status} />
              </View>
              <Text style={{ flex: 1, fontSize: typeScale.footnote, color: colors.textPrimary }}>
                {`${index + 1}. ${step.description}`}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

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

  const shownSteps = useMemo(
    () =>
      runFinished
        ? steps.map((step): AgiWorkPlanStep =>
            step.status === 'in_progress' ? { ...step, status: CANCELLED } : step,
          )
        : steps,
    [steps, runFinished],
  );

  const retryIndex = runFinished
    ? shownSteps.findIndex((step) => step.status === FAILED || step.status === CANCELLED)
    : -1;

  if (!awaitingApproval && steps.length === 0) return null;

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
    const step = retryIndex >= 0 ? shownSteps[retryIndex]! : null;
    return (
      <View testID="agiwork-plan-run" style={frame}>
        <PlanProgress steps={shownSteps} runFinished={runFinished} />
        {step ? (
          <View testID="agiwork-plan-retry" accessibilityLabel="Retry a step" style={{ gap: 10 }}>
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
              hitSlop={{ top: 4, bottom: 4 }}
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
                style={{
                  fontSize: typeScale.footnote,
                  fontWeight: '500',
                  color: colors.textPrimary,
                }}
              >
                {LABEL.retryFrom}
              </Text>
            </PressableBox>
          </View>
        ) : null}
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
          hitSlop={{ top: 4, bottom: 4 }}
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
