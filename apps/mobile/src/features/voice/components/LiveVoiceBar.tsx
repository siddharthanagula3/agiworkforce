import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Keyboard, Mic, MicOff, RotateCcw, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { StatusStep } from '@/src/features/chat/components/StatusStep';
import { VoiceOrb } from './VoiceOrb';
import type { LiveVoiceStatus } from '@/src/features/voice/hooks/useLiveVoiceSession';
import type { LiveTranscriptTurn } from '@/src/features/voice/services/liveVoiceSession';

export interface LiveVoiceBarProps {
  visible: boolean;
  status: LiveVoiceStatus;
  muted: boolean;
  assistantSpeaking: boolean;
  backendBusy: boolean;
  interrupted: boolean;
  turns: LiveTranscriptTurn[];
  error: string | null;
  onToggleMute: () => void;
  onSwitchToText: () => void;
  onRetry: () => void;
  onExit: () => void;
}

const TRANSCRIPT_MAX_HEIGHT = 180;

function statusLabel(
  status: LiveVoiceStatus,
  muted: boolean,
  assistantSpeaking: boolean,
  interrupted: boolean,
): string {
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
  muted,
  assistantSpeaking,
  backendBusy,
  interrupted,
  turns,
  error,
  onToggleMute,
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
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}
      accessibilityLiveRegion="polite"
    >
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        <VoiceOrb phase={orbPhase} audioLevel={assistantSpeaking ? 0.6 : 0} />
      </View>

      <Text
        testID="live-voice-status"
        style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 8 }}
      >
        {statusLabel(status, muted, assistantSpeaking, interrupted)}
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
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{error}</Text>
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
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Try again</Text>
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
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Use the keyboard</Text>
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
              <Text style={{ color: colors.textMuted, fontSize: 11, letterSpacing: 0.6 }}>
                {turn.role === 'user' ? 'YOU' : 'AGI'}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 21 }}>
                {turn.text}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {backendBusy ? (
        <View testID="live-voice-activity" style={{ marginBottom: 12 }}>
          <StatusStep
            step={{
              id: 'live-voice-backend',
              icon: 'thinking',
              message: 'Working on your request',
              status: 'running',
            }}
          />
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
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>Type instead</Text>
        </Pressable>

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
            <MicOff size={22} color={colors.white} />
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
