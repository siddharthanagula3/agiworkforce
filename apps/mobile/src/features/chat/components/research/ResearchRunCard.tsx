import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  AlertCircle,
  Check,
  CircleDashed,
  CircleSlash,
  FileText,
  ListChecks,
  Play,
  RefreshCw,
  Search,
  Square,
  Telescope,
  X,
} from 'lucide-react-native';
import type { ResearchStep } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors, type ColorScheme } from '@/src/ui/theme';
import {
  formatResearchElapsed,
  isResearchRunActive,
  RESEARCH_PHASE_LABELS,
  researchCountsSummary,
  type ResearchRunState,
} from '@/src/features/chat/utils/researchRunState';

export type ResearchPlanDecision = 'start' | 'cancel';

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
            fontSize: 12,
            lineHeight: 17,
            color: step.status === 'pending' ? colors.textSecondary : colors.textPrimary,
          }}
        >
          {step.description}
        </Text>
        {step.status === 'dropped' && step.note ? (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{step.note}</Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>
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
    <Pressable
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
          fontSize: 12,
          fontWeight: '600',
          color: emphasis ? colors.background : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface ResearchRunCardProps {
  research: ResearchRunState;
  isStreaming: boolean;
  isResuming?: boolean;
  onPlanDecision?: (decision: ResearchPlanDecision) => void;
  onStop?: () => void;
  onRetry?: () => void;
}

export function ResearchRunCard({
  research,
  isStreaming,
  isResuming = false,
  onPlanDecision,
  onStop,
  onRetry,
}: ResearchRunCardProps) {
  const colors = useThemeColors();
  const active = isStreaming && isResearchRunActive(research);

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
  const complete = research.phase === 'complete';
  const awaitingApproval = research.phase === 'awaiting_approval';

  const counts = researchCountsSummary(research);
  const steps = research.steps ?? [];
  const canDecide = Boolean(onPlanDecision) && awaitingApproval && !isStreaming;
  const canRetry = Boolean(onRetry) && (failed || interrupted) && !isStreaming;
  const canStop = Boolean(onStop) && active;

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
        ) : complete ? (
          <Check size={14} color={tint} />
        ) : awaitingApproval ? (
          <ListChecks size={14} color={tint} />
        ) : (
          <Telescope size={14} color={tint} />
        )}
        <Text
          style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.textPrimary }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {elapsed > 0 ? (
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            {formatResearchElapsed(elapsed)}
          </Text>
        ) : null}
      </View>

      {counts.length > 0 ? (
        <Text testID="research-run-counts" style={{ fontSize: 11, color: colors.textSecondary }}>
          {counts.join(' · ')}
        </Text>
      ) : null}

      {interrupted ? (
        <Text style={{ fontSize: 11, color: colors.textMuted }}>Stopped before it finished.</Text>
      ) : null}
      {failed && research.error && research.error !== label ? (
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>{research.error}</Text>
      ) : null}

      {steps.length > 0 ? (
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

      {canDecide || canRetry || canStop ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {canDecide ? (
            <>
              <ActionButton
                label={isResuming ? 'Starting…' : 'Approve plan'}
                icon={Play}
                emphasis
                disabled={isResuming}
                onPress={() => onPlanDecision?.('start')}
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
              label={isResuming ? 'Retrying…' : 'Retry'}
              icon={RefreshCw}
              disabled={isResuming}
              onPress={() => onRetry?.()}
              testID="research-run-retry"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
