import { useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Check, Keyboard, Mic, MicOff, RotateCcw, ShieldQuestion, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import type {
  LiveVoicePendingApproval,
  LiveVoiceToolDecision,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { useThemeColors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import { StatusStep } from '@/src/features/chat/components/StatusStep';
import { VoiceOrb } from './VoiceOrb';
import { AudioRoutePicker } from './AudioRoutePicker';
import type { LiveVoiceStatus } from '@/src/features/voice/hooks/useLiveVoiceSession';
import type {
  LiveTranscriptTurn,
  LiveVoiceToolActivity,
  LiveVoiceToolOutcome,
} from '@/src/features/voice/services/liveVoiceSession';

export interface LiveVoiceBarProps {
  visible: boolean;
  status: LiveVoiceStatus;
  reconnecting: boolean;
  muted: boolean;
  assistantSpeaking: boolean;
  backendBusy: boolean;
  interrupted: boolean;
  turns: LiveTranscriptTurn[];
  error: string | null;
  approvals: readonly LiveVoicePendingApproval[];
  toolActivity: readonly LiveVoiceToolActivity[];
  toolOutcomes: readonly LiveVoiceToolOutcome[];
  onDecideApproval: (callId: string, decision: LiveVoiceToolDecision) => void;
  onToggleMute: () => void;
  onStopTask: () => void;
  onSwitchToText: () => void;
  onRetry: () => void;
  onExit: () => void;
}

const TRANSCRIPT_MAX_HEIGHT = 180;
const APPROVAL_TITLE = 'Waiting for your approval';
const BACKEND_BUSY_LABEL = 'Working on your request';
const SLOW_TOOL_SUFFIX = 'is taking longer than usual';
const TOOL_RESULTS_TITLE = 'What the actions returned';
const TOOL_FAILED_LABEL = 'Did not complete';
const TOOL_OUTPUT_LINES = 3;

function activityMessage(activity: LiveVoiceToolActivity): string {
  return activity.state === 'timed_out' ? `${activity.label} ${SLOW_TOOL_SUFFIX}` : activity.label;
}

function statusLabel(
  status: LiveVoiceStatus,
  muted: boolean,
  assistantSpeaking: boolean,
  interrupted: boolean,
  reconnecting: boolean,
): string {
  if (reconnecting) return 'Reconnecting live voice...';
  if (status === 'connecting') return 'Connecting live voice...';
  if (status === 'error') return 'Live voice stopped';
  if (muted) return 'Muted, tap the mic to talk';
  if (interrupted) return 'Go ahead';
  if (assistantSpeaking) return 'Speaking, talk any time to interrupt';
  return 'Listening';
}

export function LiveVoiceBar({
  visible,
  status,
  reconnecting,
  muted,
  assistantSpeaking,
  backendBusy,
  interrupted,
  turns,
  error,
  approvals,
  toolActivity,
  toolOutcomes,
  onDecideApproval,
  onToggleMute,
  onStopTask,
  onSwitchToText,
  onRetry,
  onExit,
}: LiveVoiceBarProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const insets = useSafeAreaInsets();
  const transcriptRef = useRef<ScrollView>(null);

  useEffect(() => {
    transcriptRef.current?.scrollToEnd({ animated: true });
  }, [turns]);

  if (!visible) return null;

  const tap = (fn: () => void) => () => {
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  const orbPhase =
    status === 'connecting'
      ? 'thinking'
      : assistantSpeaking
        ? 'speaking'
        : muted
          ? 'idle'
          : 'listening';
  const controlStyle = {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  return (
    <Animated.View
      testID="live-voice-bar"
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <VoiceOrb phase={orbPhase} audioLevel={assistantSpeaking ? 0.6 : 0} />
      </View>

      <Text
        testID="live-voice-status"
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.footnote,
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        {statusLabel(status, muted, assistantSpeaking, interrupted, reconnecting)}
      </Text>

      {error ? (
        <View
          testID="live-voice-error"
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.dangerBorder,
            backgroundColor: colors.inputSurface,
            padding: 12,
            marginBottom: 12,
            gap: 10,
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>{error}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={tap(onRetry)}
              accessibilityRole="button"
              accessibilityLabel="Try live voice again"
              testID="live-voice-retry"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 999,
                backgroundColor: colors.inputSurface,
              }}
            >
              <RotateCcw size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                Try again
              </Text>
            </Pressable>
            <Pressable
              onPress={tap(onSwitchToText)}
              accessibilityRole="button"
              accessibilityLabel="Type a message instead"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                height: 36,
                borderRadius: 999,
                backgroundColor: colors.inputSurface,
              }}
            >
              <Keyboard size={16} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                Use the keyboard
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {turns.length > 0 ? (
        <ScrollView
          testID="live-voice-transcript"
          ref={transcriptRef}
          style={{ maxHeight: TRANSCRIPT_MAX_HEIGHT, marginBottom: 12 }}
          contentContainerStyle={{ gap: 10 }}
        >
          {turns.map((turn) => (
            <View key={turn.turnId} style={{ gap: 2 }}>
              <Text
                style={{ color: colors.textMuted, fontSize: typeScale.caption, letterSpacing: 0.6 }}
              >
                {turn.role === 'user' ? 'YOU' : 'AGI'}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, lineHeight: 21 }}>
                {turn.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {toolOutcomes.length > 0 ? (
        <View testID="live-voice-tool-results" style={{ marginBottom: 12, gap: 8 }}>
          <Text
            style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            {TOOL_RESULTS_TITLE}
          </Text>
          {toolOutcomes.map((outcome) => (
            <View
              key={outcome.callId}
              testID="live-voice-tool-result"
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: outcome.isError ? colors.dangerBorder : colors.border,
                backgroundColor: colors.inputSurface,
                padding: 10,
                gap: 4,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                }}
              >
                {outcome.isError ? `${outcome.label} · ${TOOL_FAILED_LABEL}` : outcome.label}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
                numberOfLines={TOOL_OUTPUT_LINES}
              >
                {outcome.output}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {approvals.map((approval) => (
        <View
          key={approval.callId}
          testID="live-voice-approval"
          accessibilityLabel={`${APPROVAL_TITLE}: ${approval.summary}`}
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSurface,
            padding: 12,
            marginBottom: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShieldQuestion size={16} color={colors.agentWarning} />
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
            >
              {APPROVAL_TITLE}
            </Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>
            {approval.summary}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }} numberOfLines={1}>
            {approval.name}
          </Text>
          {approval.input ? (
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.caption, lineHeight: 17 }}
              numberOfLines={6}
            >
              {approval.input}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={tap(() => onDecideApproval(approval.callId, 'approved'))}
              disabled={approval.deciding}
              accessibilityRole="button"
              accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.approve}: ${approval.summary}`}
              accessibilityState={{ disabled: approval.deciding, busy: approval.deciding }}
              testID="live-voice-approve"
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 44,
                borderRadius: 999,
                backgroundColor: colors.teal,
                opacity: approval.deciding ? 0.6 : 1,
              }}
            >
              {approval.deciding ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Check size={16} color={colors.accentText} />
              )}
              <Text
                style={{ color: colors.accentText, fontSize: typeScale.subhead, fontWeight: '600' }}
              >
                {TOOL_APPROVAL_ACTION_LABELS.approve}
              </Text>
            </Pressable>
            <Pressable
              onPress={tap(() => onDecideApproval(approval.callId, 'rejected'))}
              disabled={approval.deciding}
              accessibilityRole="button"
              accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.deny}: ${approval.summary}`}
              accessibilityState={{ disabled: approval.deciding }}
              testID="live-voice-deny"
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.agentError,
                opacity: approval.deciding ? 0.6 : 1,
              }}
            >
              <X size={16} color={colors.agentError} />
              <Text
                style={{ color: colors.agentError, fontSize: typeScale.subhead, fontWeight: '600' }}
              >
                {TOOL_APPROVAL_ACTION_LABELS.deny}
              </Text>
            </Pressable>
          </View>
        </View>
      ))}

      {backendBusy ? (
        <View testID="live-voice-activity" style={{ marginBottom: 12 }}>
          {toolActivity.length > 0 ? (
            toolActivity.map((activity) => (
              <StatusStep
                key={activity.delegationId}
                step={{
                  id: activity.delegationId,
                  icon: 'thinking',
                  message: activityMessage(activity),
                  status: 'running',
                }}
              />
            ))
          ) : (
            <StatusStep
              step={{
                id: 'live-voice-backend',
                icon: 'thinking',
                message: BACKEND_BUSY_LABEL,
                status: 'running',
              }}
            />
          )}
          <Pressable
            onPress={tap(onStopTask)}
            accessibilityRole="button"
            accessibilityLabel="Stop the task and keep talking"
            testID="live-voice-stop-task"
            style={{
              alignSelf: 'flex-start',
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 14,
              marginTop: 6,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: typeScale.subhead,
                fontWeight: '600',
              }}
            >
              Stop the task
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={tap(onSwitchToText)}
          accessibilityRole="button"
          accessibilityLabel="Switch to text for this chat"
          testID="live-voice-keyboard"
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            height: 48,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: colors.inputSurface,
          }}
        >
          <Keyboard size={20} color={colors.textSecondary} />
          <Text style={{ color: colors.textMuted, fontSize: typeScale.callout }}>Type instead</Text>
        </Pressable>

        <AudioRoutePicker compact />

        <Pressable
          onPress={tap(onToggleMute)}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
          accessibilityState={{ selected: muted }}
          testID="live-voice-mute"
          style={{
            ...controlStyle,
            backgroundColor: muted ? colors.agentError : colors.inputSurface,
            borderWidth: muted ? 1 : 0,
            borderColor: colors.dangerBorder,
          }}
        >
          {muted ? (
            <MicOff size={22} color={colors.accentText} />
          ) : (
            <Mic size={22} color={status === 'live' ? colors.agentActive : colors.textSecondary} />
          )}
        </Pressable>

        <Pressable
          onPress={tap(onExit)}
          accessibilityRole="button"
          accessibilityLabel="End live voice"
          testID="live-voice-exit"
          style={({ pressed }) => ({
            ...controlStyle,
            backgroundColor: colors.textPrimary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <X size={22} color={colors.surfaceBase} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
