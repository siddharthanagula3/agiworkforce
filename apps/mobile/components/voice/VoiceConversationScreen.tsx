import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { X, MicOff, Mic, Phone } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Waveform } from './Waveform';
import { colors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceService from '@/services/voice';
import * as TTS from '@/services/tts';

/**
 * Full-screen voice conversation mode.
 * Resembles ChatGPT Advanced Voice — centered waveform, status text,
 * mute and end-call buttons. Swipe down or X to dismiss.
 */

type ConversationPhase =
  | 'listening' // User is speaking (blue waveform)
  | 'thinking' // AI is processing (purple pulse)
  | 'speaking' // AI is speaking back (teal waveform)
  | 'idle'; // Waiting for user to start

interface VoiceConversationScreenProps {
  /** Whether the full-screen overlay is visible */
  visible: boolean;
  /** Close the voice conversation screen */
  onClose: () => void;
  /** Send transcribed user text to the chat engine and get AI response text */
  onSendMessage: (text: string) => Promise<string>;
}

const PHASE_CONFIG: Record<ConversationPhase, { label: string; color: string; sublabel: string }> =
  {
    idle: {
      label: 'Tap to speak',
      color: colors.textMuted,
      sublabel: 'Voice conversation mode',
    },
    listening: {
      label: 'Listening...',
      color: colors.agentActive,
      sublabel: 'Speak naturally',
    },
    thinking: {
      label: 'Thinking...',
      color: colors.agentThinking,
      sublabel: 'Processing your message',
    },
    speaking: {
      label: 'Speaking...',
      color: colors.teal,
      sublabel: 'AI is responding',
    },
  };

function CenterOrb({ phase, audioLevel }: { phase: ConversationPhase; audioLevel: number }) {
  const orbScale = useSharedValue(1);
  const orbGlow = useSharedValue(0.2);

  useEffect(() => {
    if (phase === 'thinking') {
      orbScale.value = withRepeat(
        withSequence(withTiming(1.15, { duration: 800 }), withTiming(0.95, { duration: 800 })),
        -1,
        true,
      );
      orbGlow.value = withRepeat(withTiming(0.5, { duration: 800 }), -1, true);
    } else if (phase === 'listening' || phase === 'speaking') {
      const targetScale = 1 + audioLevel * 0.3;
      orbScale.value = withSpring(targetScale, { damping: 10, stiffness: 200 });
      orbGlow.value = withSpring(0.3 + audioLevel * 0.4, { damping: 10 });
    } else {
      orbScale.value = withSpring(1, { damping: 15 });
      orbGlow.value = withSpring(0.2, { damping: 15 });
    }
  }, [phase, audioLevel, orbScale, orbGlow]);

  const orbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: orbGlow.value,
    transform: [{ scale: orbScale.value * 1.4 }],
  }));

  const config = PHASE_CONFIG[phase];

  return (
    <View className="items-center justify-center" style={{ width: 200, height: 200 }}>
      {/* Outer glow */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: config.color,
          },
          glowAnimatedStyle,
        ]}
      />
      {/* Main orb */}
      <Animated.View
        style={[
          {
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: config.color,
            alignItems: 'center',
            justifyContent: 'center',
          },
          orbAnimatedStyle,
        ]}
      >
        <Waveform
          color={colors.white}
          active={phase === 'listening' || phase === 'speaking'}
          audioLevel={audioLevel}
          barCount={5}
          maxHeight={40}
          minHeight={6}
          barWidth={4}
          gap={5}
        />
      </Animated.View>
    </View>
  );
}

export function VoiceConversationScreen({
  visible,
  onClose,
  onSendMessage,
}: VoiceConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const [phase, setPhase] = useState<ConversationPhase>('idle');
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptPreview, setTranscriptPreview] = useState('');

  // Keep track of whether we should auto-listen after AI speaks
  const autoListenRef = useRef(true);
  const activeRef = useRef(false);

  const cleanup = useCallback(async () => {
    autoListenRef.current = false;
    if (VoiceService.isRecording()) {
      await VoiceService.cancelRecording();
    }
    await TTS.stop();
  }, []);

  // Reset state when becoming visible
  useEffect(() => {
    if (visible) {
      activeRef.current = true;
      setPhase('idle');
      setMuted(false);
      setAudioLevel(0);
      setTranscriptPreview('');
    } else {
      activeRef.current = false;
      cleanup();
    }
  }, [visible, cleanup]);

  const startListening = useCallback(async () => {
    if (!activeRef.current || muted) return;

    try {
      setPhase('listening');
      setTranscriptPreview('');
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      await VoiceService.startRecording((event) => {
        if (!activeRef.current) return;
        // Normalize metering from dB (-160..0) to 0..1
        const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
        setAudioLevel(normalized);
      });
    } catch {
      if (activeRef.current) {
        setPhase('idle');
      }
    }
  }, [muted, hapticsEnabled]);

  const stopListeningAndProcess = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      // Stop recording
      setPhase('thinking');
      setAudioLevel(0);
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const uri = await VoiceService.stopRecording();
      const { text } = await VoiceService.transcribe(uri);

      if (!text.trim() || !activeRef.current) {
        if (activeRef.current) setPhase('idle');
        return;
      }

      setTranscriptPreview(text.trim());

      // Send to AI and get response
      const aiResponse = await onSendMessage(text.trim());

      if (!activeRef.current) return;

      // Speak AI response
      setPhase('speaking');
      await TTS.speak(aiResponse, {
        rate: 1.0,
        onStart: () => {
          if (activeRef.current) setAudioLevel(0.5);
        },
        onDone: () => {
          if (activeRef.current && autoListenRef.current) {
            setAudioLevel(0);
            // Auto-start listening again after AI finishes speaking
            startListening();
          }
        },
        onStopped: () => {
          if (activeRef.current) {
            setAudioLevel(0);
            setPhase('idle');
          }
        },
      });
    } catch {
      if (activeRef.current) {
        setPhase('idle');
        setAudioLevel(0);
      }
    }
  }, [hapticsEnabled, onSendMessage, startListening]);

  const handleOrbPress = useCallback(() => {
    if (phase === 'idle') {
      autoListenRef.current = true;
      startListening();
    } else if (phase === 'listening') {
      stopListeningAndProcess();
    } else if (phase === 'speaking') {
      // Interrupt AI — stop TTS and go back to listening
      TTS.stop();
      autoListenRef.current = true;
      startListening();
    }
  }, [phase, startListening, stopListeningAndProcess]);

  const handleMuteToggle = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (newMuted && phase === 'listening') {
      VoiceService.cancelRecording();
      setPhase('idle');
      setAudioLevel(0);
    }
  }, [muted, hapticsEnabled, phase]);

  const handleEndCall = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    autoListenRef.current = false;
    await cleanup();
    onClose();
  }, [hapticsEnabled, cleanup, onClose]);

  const handleClose = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    autoListenRef.current = false;
    await cleanup();
    onClose();
  }, [hapticsEnabled, cleanup, onClose]);

  if (!visible) return null;

  const config = PHASE_CONFIG[phase];

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(18)}
      exiting={SlideOutDown.springify().damping(18)}
      className="absolute inset-0 z-50"
      style={{ backgroundColor: colors.background }}
    >
      <StatusBar barStyle="light-content" />

      {/* Close button */}
      <Pressable
        onPress={handleClose}
        className="absolute z-10 p-2 rounded-full bg-white/10 active:bg-white/20"
        style={{ top: insets.top + 12, right: 16 }}
        accessibilityLabel="Close voice conversation"
        accessibilityRole="button"
      >
        <X size={22} color={colors.textSecondary} />
      </Pressable>

      {/* Main content */}
      <View
        className="flex-1 items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Status sublabel */}
        <Text className="text-white/40 text-sm mb-4">{config.sublabel}</Text>

        {/* Center orb — tap to interact */}
        <Pressable onPress={handleOrbPress} accessibilityLabel={config.label}>
          <CenterOrb phase={phase} audioLevel={audioLevel} />
        </Pressable>

        {/* Phase label */}
        <Text className="text-lg font-medium mt-6" style={{ color: config.color }}>
          {config.label}
        </Text>

        {/* Transcript preview */}
        {transcriptPreview ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="mt-4 mx-8 px-4 py-2 rounded-xl bg-white/5"
          >
            <Text className="text-white/60 text-sm text-center" numberOfLines={3}>
              {transcriptPreview}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom controls */}
      <View
        className="flex-row items-center justify-center gap-12 pb-4"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Mute button */}
        <Pressable
          onPress={handleMuteToggle}
          className="w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{ backgroundColor: muted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)' }}
          accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
          accessibilityRole="button"
        >
          {muted ? (
            <MicOff size={24} color={colors.agentError} />
          ) : (
            <Mic size={24} color={colors.textPrimary} />
          )}
        </Pressable>

        {/* End call button */}
        <Pressable
          onPress={handleEndCall}
          className="w-16 h-16 rounded-full items-center justify-center active:opacity-80"
          style={{ backgroundColor: colors.agentError }}
          accessibilityLabel="End voice conversation"
          accessibilityRole="button"
        >
          <Phone size={26} color={colors.white} style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
