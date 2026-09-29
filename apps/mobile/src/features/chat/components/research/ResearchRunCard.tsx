import { useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  AlertCircle,
  Check,
  CircleDashed,
  CircleSlash,
  FileText,
  ListChecks,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Telescope,
  X,
} from 'lucide-react-native';
import type { ResearchStep } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  formatResearchElapsed,
  isResearchRunActive,
  RESEARCH_PHASE_LABELS,
  researchCountsSummary,
  type ResearchRunState,
} from '@/src/features/chat/utils/researchRunState';

export type ResearchPlanDecision = 'start' | 'cancel' | { steps: ResearchStep[] };

const MAX_PLAN_STEPS = 6;
const MAX_STEP_CHARS = 300;

const STEP_STATUS_LABELS: Record<ResearchStep['status'], string> = {
  pending: 'Queued',
  running: 'In progress',
  completed: 'Done',
  failed: 'Failed',
  dropped: 'Not run',
};

function stepTint(status: ResearchStep['status'], colors: ColorScheme): string {
  if (status === 'completed') return colors.agentSuccess;
  if (status === 'failed') return colors.agentError;
  if (status === 'running') return colors.agentActive;
  return colors.textMuted;
}

function StepIcon({ step, colors }: { step: ResearchStep; colors: ColorScheme }) {
  const tint = stepTint(step.status, colors);
  if (step.status === 'completed') return <Check size={13} color={tint} />;
  if (step.status === 'failed') return <AlertCircle size={13} color={tint} />;
  if (step.status === 'running') return <ActivityIndicator size="small" color={tint} />;
  if (step.status === 'dropped') return <CircleSlash size={13} color={tint} />;
  return <CircleDashed size={13} color={tint} />;
}

function PlanStepRow({ step }: { step: ResearchStep }) {
  const colors = useThemeColors();
  if (step.type === 'analyze') {
    return (
      <View
        accessible
        accessibilityLabel={`Your guidance: ${step.description}`}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}
      >
        <View style={{ width: 14, alignItems: 'center', paddingTop: 2 }}>
          <MessageSquare size={13} color={colors.agentActive} />
        </View>
        <Text
          style={{
            flex: 1,
            fontSize: typeScale.caption,
            lineHeight: 17,
            color: colors.textPrimary,
          }}
        >
          {step.description}
        </Text>
        <Text
          style={{
            fontSize: typeScale.caption,
            color: colors.textMuted,
            textTransform: 'uppercase',
          }}
        >
          Your guidance
        </Text>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={`${step.description}. ${STEP_STATUS_LABELS[step.status]}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}
    >
      <View style={{ width: 14, alignItems: 'center', paddingTop: 2 }}>
        <StepIcon step={step} colors={colors} />
      </View>
      {step.type === 'synthesize' ? (
        <FileText size={12} color={colors.textMuted} style={{ marginTop: 3 }} />
      ) : (
        <Search size={12} color={colors.textMuted} style={{ marginTop: 3 }} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: typeScale.caption,
            lineHeight: 17,
            color: step.status === 'pending' ? colors.textSecondary : colors.textPrimary,
          }}
        >
          {step.description}
        </Text>
        {step.status === 'dropped' && step.note ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted, marginTop: 2 }}>
            {step.note}
          </Text>
        ) : null}
      </View>
      <Text
        style={{ fontSize: typeScale.caption, color: colors.textMuted, textTransform: 'uppercase' }}
      >
        {STEP_STATUS_LABELS[step.status]}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onPress,
  disabled,
  emphasis,
  testID,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  disabled?: boolean;
  emphasis?: boolean;
  testID?: string;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: radii.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
        backgroundColor: emphasis ? colors.textPrimary : colors.accentSurface,
        borderWidth: 1,
        borderColor: emphasis ? colors.textPrimary : colors.accentBorder,
      })}
    >
      <Icon size={13} color={emphasis ? colors.background : colors.textPrimary} />
      <Text
        style={{
          fontSize: typeScale.caption,
          fontWeight: '600',
          color: emphasis ? colors.background : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </PressableBox>
  );
}

function PlanEditor({
  steps,
  onChange,
}: {
  steps: ResearchStep[];
  onChange: (steps: ResearchStep[]) => void;
}) {
  const colors = useThemeColors();
  const edit = (id: string, description: string) =>
    onChange(steps.map((step) => (step.id === id ? { ...step, description } : step)));
  const remove = (id: string) => onChange(steps.filter((step) => step.id !== id));
  const add = () =>
    onChange([
      ...steps,
      {
        id: `draft-${steps.length}-${Date.now()}`,
        type: 'search',
        description: '',
        status: 'pending',
      },
    ]);
  return (
    <View
      testID="research-plan-editor"
      accessibilityLabel="Research plan, editable"
      style={{ borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 6, gap: 6 }}
    >
      <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
        Edit any step before it runs. What you start here is exactly what gets searched.
      </Text>
      {steps.map((step, index) => (
        <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            value={step.description}
            onChangeText={(text) => edit(step.id, text)}
            maxLength={MAX_STEP_CHARS}
            multiline
            accessibilityLabel={`Step ${index + 1}`}
            placeholder="Describe what to search"
            placeholderTextColor={colors.textMuted}
            style={{
              flex: 1,
              fontSize: typeScale.caption,
              lineHeight: 17,
              color: colors.textPrimary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radii.md,
              paddingHorizontal: 8,
              paddingVertical: 6,
            }}
          />
          <PressableBox
            onPress={() => remove(step.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove step ${index + 1}`}
            hitSlop={8}
            style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} color={colors.textMuted} />
          </PressableBox>
        </View>
      ))}
      {steps.length < MAX_PLAN_STEPS ? (
        <ActionButton
          label="Add a step"
          icon={Plus}
          onPress={add}
          testID="research-plan-add-step"
        />
      ) : null}
    </View>
  );
}

interface ResearchRunCardProps {
  research: ResearchRunState;
  isStreaming: boolean;
  isResuming?: boolean;
  onPlanDecision?: (decision: ResearchPlanDecision) => void;
  onStop?: () => void;
  onPause?: () => Promise<boolean>;
  onRetry?: () => void;
}

export function ResearchRunCard({
  research,
  isStreaming,
  isResuming = false,
  onPlanDecision,
  onStop,
  onPause,
  onRetry,
}: ResearchRunCardProps) {
  const colors = useThemeColors();
  const active = isStreaming && isResearchRunActive(research);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [draftSteps, setDraftSteps] = useState<ResearchStep[] | null>(null);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  const anchorElapsed = research.elapsedMs ?? 0;
  const startedAtMs = research.startedAt ? Date.parse(research.startedAt) : NaN;
  const elapsed =
    active && Number.isFinite(startedAtMs)
      ? Math.max(anchorElapsed, nowMs - startedAtMs)
      : anchorElapsed;

  const label = research.label || RESEARCH_PHASE_LABELS[research.phase];
  const failed = research.phase === 'error';
  const interrupted = research.phase === 'interrupted';
  const paused = research.phase === 'paused';
  const complete = research.phase === 'complete';
  const awaitingApproval = research.phase === 'awaiting_approval';

  const counts = researchCountsSummary(research);
  const steps = research.steps ?? [];
  const gaps = research.gaps ?? [];
  const canDecide = Boolean(onPlanDecision) && awaitingApproval && !isStreaming;
  const canRetry = Boolean(onRetry) && (failed || interrupted || paused) && !isStreaming;
  const canRunAgain = Boolean(onRetry) && complete && !isStreaming;
  const editedSteps =
    draftSteps ?? steps.filter((step) => step.type === 'search' && step.status === 'pending');
  const planReady = editedSteps.some((step) => step.description.trim() !== '');
  const canStop = Boolean(onStop) && active;
  const canPause = Boolean(onPause) && active && research.phase !== 'synthesizing';

  const requestPause = async () => {
    if (!onPause) return;
    setPauseRequested(true);
    if (!(await onPause())) setPauseRequested(false);
  };

  const tint = failed ? colors.agentError : complete ? colors.agentSuccess : colors.agentActive;

  return (
    <View
      testID="research-run-card"
      accessibilityLabel={`Deep research: ${label}`}
      style={{
        borderWidth: 1,
        borderRadius: radii.lg,
        borderColor: failed ? colors.dangerBorder : colors.border,
        backgroundColor: failed ? colors.dangerSurface : colors.surfaceBase,
        padding: 10,
        gap: 8,
        marginBottom: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {failed ? (
          <AlertCircle size={14} color={tint} />
        ) : interrupted ? (
          <Square size={13} color={colors.textMuted} />
        ) : paused ? (
          <Pause size={13} color={tint} />
        ) : complete ? (
          <Check size={14} color={tint} />
        ) : awaitingApproval ? (
          <ListChecks size={14} color={tint} />
        ) : (
          <Telescope size={14} color={tint} />
        )}
        <Text
          style={{
            flex: 1,
            fontSize: typeScale.footnote,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {elapsed > 0 ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            {formatResearchElapsed(elapsed)}
          </Text>
        ) : null}
      </View>

      {counts.length > 0 ? (
        <Text
          testID="research-run-counts"
          style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
        >
          {counts.join(' · ')}
        </Text>
      ) : null}

      {interrupted ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          Stopped before it finished.
        </Text>
      ) : null}
      {paused ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          Paused. Resume to continue from where it stopped.
        </Text>
      ) : null}
      {failed && research.error && research.error !== label ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
          {research.error}
        </Text>
      ) : null}

      {steps.length > 0 && !canDecide ? (
        <View
          testID="research-run-plan"
          accessibilityLabel="Research plan"
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
            paddingTop: 4,
          }}
        >
          {steps.map((step) => (
            <PlanStepRow key={step.id} step={step} />
          ))}
        </View>
      ) : null}

      {canDecide ? <PlanEditor steps={editedSteps} onChange={setDraftSteps} /> : null}

      {gaps.length > 0 ? (
        <View
          testID="research-run-questions"
          accessibilityLabel="Planned questions"
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.borderLight,
            paddingTop: 6,
            gap: 6,
          }}
        >
          <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textMuted }}>
            Planned questions
          </Text>
          {gaps.map((gap) => (
            <View key={gap.id} style={{ gap: 2 }}>
              <Text
                style={{ fontSize: typeScale.caption, lineHeight: 17, color: colors.textPrimary }}
              >
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                    color: colors.textPrimary,
                  }}
                >
                  {gap.status === 'closed' ? 'Answered: ' : 'Not answered: '}
                </Text>
                {gap.question}
              </Text>
              {gap.status === 'open' ? (
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    lineHeight: 16,
                    color: colors.textSecondary,
                  }}
                >
                  {gap.reason}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {canDecide || canRetry || canRunAgain || canStop || canPause ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {canDecide ? (
            <>
              <ActionButton
                label={isResuming ? 'Starting…' : 'Approve plan'}
                icon={Play}
                emphasis
                disabled={isResuming || !planReady}
                onPress={() =>
                  onPlanDecision?.(
                    draftSteps === null
                      ? 'start'
                      : {
                          steps: draftSteps
                            .map((step) => ({ ...step, description: step.description.trim() }))
                            .filter((step) => step.description !== ''),
                        },
                  )
                }
                testID="research-plan-approve"
              />
              <ActionButton
                label="Cancel"
                icon={X}
                disabled={isResuming}
                onPress={() => onPlanDecision?.('cancel')}
                testID="research-plan-cancel"
              />
            </>
          ) : null}
          {canPause ? (
            <ActionButton
              label={pauseRequested ? 'Pausing…' : 'Pause'}
              icon={Pause}
              disabled={pauseRequested}
              onPress={() => void requestPause()}
              testID="research-run-pause"
            />
          ) : null}
          {canStop ? (
            <ActionButton
              label="Stop"
              icon={Square}
              onPress={() => onStop?.()}
              testID="research-run-stop"
            />
          ) : null}
          {canRetry ? (
            <ActionButton
              label={
                failed ? (isResuming ? 'Retrying…' : 'Retry') : isResuming ? 'Resuming…' : 'Resume'
              }
              icon={failed ? RefreshCw : Play}
              disabled={isResuming}
              onPress={() => onRetry?.()}
              testID="research-run-retry"
            />
          ) : null}
          {canRunAgain ? (
            <ActionButton
              label="Run again"
              icon={RefreshCw}
              onPress={() => onRetry?.()}
              testID="research-run-again"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
