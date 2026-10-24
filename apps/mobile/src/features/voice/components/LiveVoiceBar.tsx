import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  Check,
  Keyboard,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShieldQuestion,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TOOL_APPROVAL_ACTION_LABELS, TOOL_APPROVAL_HIGH_RISK_NOTICE } from '@agiworkforce/types';
import {
  readToolApprovalReview,
  type LiveVoicePendingApproval,
  type LiveVoiceToolDecision,
  type LiveVoiceToolFile,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/Text';
import { useThemeColors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import { StatusStep } from '@/src/features/chat/components/StatusStep';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { formatClock } from '@/src/lib/time';
import { VoiceOrb } from './VoiceOrb';
import { AudioRoutePicker } from './AudioRoutePicker';
import { VoiceToolFiles } from './VoiceToolFiles';
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
  paused: boolean;
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
  onTogglePause: () => void;
  onStopTask: () => void;
  onSwitchToText: () => void;
  onRetry: () => void;
  onExit: () => void;
}

const TRANSCRIPT_MAX_HEIGHT = 180;
const ORB_WIDTH_RATIO = 0.52;
const ORB_STAGE_HEIGHT_RATIO = 0.7;
const APPROVAL_TITLE = 'Waiting for your approval';
const BACKEND_BUSY_LABEL = 'Working on your request';
const SLOW_TOOL_SUFFIX = 'is taking longer than usual';
const TOOL_RESULTS_TITLE = 'What the actions returned';
const TOOL_FAILED_LABEL = 'Did not complete';
const TOOL_OUTPUT_LINES = 3;
const TOOL_IMAGE_HEIGHT = 180;
const CALL_CLOCK_TICK_MS = 1_000;
const VOICE_SETTINGS_ROUTE = '/(app)/settings/voice';
const ELEVATED_RISK_TIERS = new Set(['high', 'critical']);

interface CallClock {
  accumulatedMs: number;
  runningSince: number | null;
}

function callClockMs(clock: CallClock, now: number): number {
  return clock.accumulatedMs + (clock.runningSince === null ? 0 : now - clock.runningSince);
}

function useCallClock(visible: boolean, running: boolean): number {
  const clockRef = useRef<CallClock>({ accumulatedMs: 0, runningSince: null });
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const clock = clockRef.current;
    const now = Date.now();
    if (!visible) {
      clockRef.current = { accumulatedMs: 0, runningSince: null };
      setElapsedMs(0);
      return undefined;
    }
    if (running && clock.runningSince === null) clock.runningSince = now;
    if (!running && clock.runningSince !== null) {
      clock.accumulatedMs += now - clock.runningSince;
      clock.runningSince = null;
    }
    setElapsedMs(callClockMs(clock, now));
    if (!running) return undefined;
    const timer = setInterval(
      () => setElapsedMs(callClockMs(clockRef.current, Date.now())),
      CALL_CLOCK_TICK_MS,
    );
    return () => clearInterval(timer);
  }, [visible, running]);

  return elapsedMs;
}

function isImageFile(file: LiveVoiceToolFile): boolean {
  return file.mimeType?.startsWith('image/') === true;
}

function VoiceToolImage({ file }: { file: LiveVoiceToolFile }) {
  const colors = useThemeColors();
  const { source, status } = useGeneratedImageSource(file.uri, false);
  if (status !== 'ready' || !source) return null;
  return (
    <Image
      testID="live-voice-tool-image"
      source={source}
      accessibilityRole="image"
      accessibilityLabel={file.name}
      resizeMode="contain"
      style={{
        width: '100%',
        height: TOOL_IMAGE_HEIGHT,
        borderRadius: 10,
        backgroundColor: colors.surfaceElevated,
      }}
    />
  );
}

function activityMessage(activity: LiveVoiceToolActivity): string {
  return activity.state === 'timed_out' ? `${activity.label} ${SLOW_TOOL_SUFFIX}` : activity.label;
}

export function liveVoiceOrbSize(windowWidth: number, stageHeight: number): number {
  const byWidth = windowWidth * ORB_WIDTH_RATIO;
  if (stageHeight <= 0) return Math.round(byWidth);
  return Math.round(Math.min(byWidth, stageHeight * ORB_STAGE_HEIGHT_RATIO));
}

function statusLabel(
  status: LiveVoiceStatus,
  pausedLabel: string | null,
  muted: boolean,
  assistantSpeaking: boolean,
  interrupted: boolean,
  reconnecting: boolean,
): string {
  if (pausedLabel) return pausedLabel;
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
  paused,
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
  onTogglePause,
  onStopTask,
  onSwitchToText,
  onRetry,
  onExit,
}: LiveVoiceBarProps) {
  const colors = useThemeColors();
  const { t } = useTranslation('chat');
  const router = useRouter();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const callElapsedMs = useCallClock(visible, status === 'live' && !paused);
  const insets = useSafeAreaInsets();
  const transcriptRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [stageHeight, setStageHeight] = useState(0);
  const handleStageLayout = (event: LayoutChangeEvent) =>
    setStageHeight(event.nativeEvent.layout.height);

  useEffect(() => {
    transcriptRef.current?.scrollToEnd({ animated: true });
  }, [turns]);

  if (!visible) return null;

  const tap = (fn: () => void) => () => {
    if (hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  const callTime = formatClock(callElapsedMs);
  const showCallTime = paused || status === 'live' || callElapsedMs > 0;
  const canPause = paused || status === 'live';
  const pauseLabel = paused ? t('liveVoice.resumeCall') : t('liveVoice.pauseCall');
  const headerButtonStyle = {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputSurface,
  } as const;
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
      style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}
      accessibilityLiveRegion="polite"
    >
      <View
        testID="live-voice-header"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
        }}
      >
        {showCallTime ? (
          <Text
            testID="live-voice-call-time"
            accessibilityLabel={t('liveVoice.callTime', { time: callTime })}
            style={{
              color: colors.textSecondary,
              fontSize: typeScale.callout,
              fontVariant: ['tabular-nums'],
            }}
          >
            {callTime}
          </Text>
        ) : (
          <View />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {canPause ? (
            <Pressable
              onPress={tap(onTogglePause)}
              accessibilityRole="button"
              accessibilityLabel={pauseLabel}
              accessibilityState={{ selected: paused }}
              testID="live-voice-pause"
              style={headerButtonStyle}
            >
              {paused ? (
                <Play size={20} color={colors.textPrimary} />
              ) : (
                <Pause size={20} color={colors.textPrimary} />
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={tap(() => router.push(VOICE_SETTINGS_ROUTE))}
            accessibilityRole="button"
            accessibilityLabel={t('liveVoice.voiceSettings')}
            testID="live-voice-settings"
            style={headerButtonStyle}
          >
            <Settings size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      <View
        testID="live-voice-stage"
        onLayout={handleStageLayout}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}
      >
        <VoiceOrb
          phase={orbPhase}
          audioLevel={assistantSpeaking ? 0.6 : 0}
          size={liveVoiceOrbSize(windowWidth, stageHeight)}
        />
        <Text
          testID="live-voice-status"
          style={{
            color: colors.textSecondary,
            fontSize: typeScale.footnote,
            textAlign: 'center',
          }}
        >
          {statusLabel(
            status,
            paused ? t('liveVoice.paused') : null,
            muted,
            assistantSpeaking,
            interrupted,
            reconnecting,
          )}
        </Text>
      </View>

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
              {outcome.files.filter(isImageFile).map((file) => (
                <VoiceToolImage key={file.uri} file={file} />
              ))}
              <VoiceToolFiles files={outcome.files} />
            </View>
          ))}
        </View>
      ) : null}

      {approvals.map((approval) => {
        const review = readToolApprovalReview(approval.review);
        const elevated = review === undefined || ELEVATED_RISK_TIERS.has(review.riskTier);
        return (
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
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                }}
              >
                {APPROVAL_TITLE}
              </Text>
            </View>
            {elevated ? (
              <View
                testID="live-voice-approval-risk"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <ShieldAlert size={14} color={colors.agentError} />
                <Text
                  style={{
                    flex: 1,
                    color: colors.agentError,
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                  }}
                >
                  {TOOL_APPROVAL_HIGH_RISK_NOTICE}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>
              {approval.summary}
            </Text>
            <Text
              style={{ color: colors.textMuted, fontSize: typeScale.caption }}
              numberOfLines={1}
            >
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
                accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.allow}: ${approval.summary}`}
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
                  style={{
                    color: colors.accentText,
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                  }}
                >
                  {TOOL_APPROVAL_ACTION_LABELS.allow}
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
                  style={{
                    color: colors.agentError,
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                  }}
                >
                  {TOOL_APPROVAL_ACTION_LABELS.deny}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

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
