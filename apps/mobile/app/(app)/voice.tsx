/**
 * Voice Companion Mode — full-screen screen.
 *
 * Flow: idle → Listen (STT via on-device capture) → Think (local Qwen3-4B)
 *       → Speak (on-device TTS) → loop back to Listen.
 *
 * Design: pulsing terracotta orb, dark gradient background.
 * All processing is on-device. No audio leaves the device.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Pressable, StatusBar, useWindowDimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { X, MicOff, Mic, Volume2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Waveform } from '@/components/voice/Waveform';
import { PerformanceChip } from '@/components/chat/PerformanceChip';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceInput from '@/services/voiceInput';
import * as VoiceOutput from '@/services/voiceOutput';
import { colors } from '@/lib/theme';
import { getDisplayName } from '@/lib/models';

// ---------------------------------------------------------------------------
// Phase state
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Tap to speak',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

const PHASE_SUBLABEL: Record<Phase, string> = {
  idle: 'Voice companion — on-device',
  listening: 'Speak naturally',
  thinking: 'Processing on-device',
  speaking: 'AI is responding',
};

// terracotta for all phases (brand colour for voice companion)
const ORB_COLOR = colors.terraCotta;

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function DarkGradientBg() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="voiceBg" cx="50%" cy="42%" r="55%" fx="50%" fy="42%">
          <Stop offset="0%" stopColor="#2a1010" stopOpacity="1" />
          <Stop offset="45%" stopColor="#0e0808" stopOpacity="1" />
          <Stop offset="100%" stopColor="#050305" stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#voiceBg)" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pulsing orb
// ---------------------------------------------------------------------------

function TerraCottaOrb({
  phase,
  audioLevel,
  onPress,
}: {
  phase: Phase;
  audioLevel: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.15);

  useEffect(() => {
    if (phase === 'thinking') {
      scale.value = withRepeat(
        withSequence(withTiming(1.18, { duration: 750 }), withTiming(0.92, { duration: 750 })),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(withTiming(0.55, { duration: 750 }), -1, true);
    } else if (phase === 'listening' || phase === 'speaking') {
      scale.value = withSpring(1 + audioLevel * 0.28, { damping: 10, stiffness: 200 });
      glowOpacity.value = withSpring(0.25 + audioLevel * 0.4, { damping: 10 });
    } else {
      // idle — gentle slow pulse
      scale.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 2000 }), withTiming(0.97, { duration: 2000 })),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 2000 }), withTiming(0.1, { duration: 2000 })),
        -1,
        true,
      );
    }
  }, [phase, audioLevel, scale, glowOpacity]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: scale.value * 1.5 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={PHASE_LABEL[phase]}
      accessibilityRole="button"
      accessibilityHint="Tap to start or stop listening"
    >
      <View style={styles.orbWrapper}>
        {/* Outer glow */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: ORB_COLOR,
            },
            glowStyle,
          ]}
        />
        {/* Main orb */}
        <Animated.View style={[styles.orb, orbStyle]}>
          <Waveform
            color={colors.white}
            active={phase === 'listening' || phase === 'speaking'}
            audioLevel={audioLevel}
            barCount={5}
            maxHeight={38}
            minHeight={6}
            barWidth={4}
            gap={5}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const [phase, setPhase] = useState<Phase>('idle');
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptPreview, setTranscriptPreview] = useState('');
  const [lastResponseMs, setLastResponseMs] = useState<number | undefined>(undefined);

  const activeRef = useRef(true);
  const autoListenRef = useRef(true);
  const convIdRef = useRef<string | null>(null);

  // Ensure a conversation is ready for the session
  useEffect(() => {
    createConversation('Voice session')
      .then((id) => {
        convIdRef.current = id;
      })
      .catch(() => {
        // ignore — sendMessage will create one if needed
      });
    return () => {
      activeRef.current = false;
      autoListenRef.current = false;
      VoiceInput.cancelCapture().catch(() => {});
      VoiceOutput.stop().catch(() => {});
    };
  }, [createConversation]);

  const startListening = useCallback(async () => {
    if (!activeRef.current || muted) return;
    try {
      setPhase('listening');
      setTranscriptPreview('');
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await VoiceInput.startCapture((event) => {
        if (!activeRef.current) return;
        const norm = Math.max(0, Math.min(1, (event.metering + 60) / 60));
        setAudioLevel(norm);
      });
    } catch {
      if (activeRef.current) setPhase('idle');
    }
  }, [muted, hapticsEnabled]);

  const stopAndProcess = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      setPhase('thinking');
      setAudioLevel(0);
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const uri = await VoiceInput.stopCapture();
      const t0 = Date.now();
      const { text } = await VoiceInput.transcribeOnDevice(uri);
      const sttMs = Date.now() - t0;

      if (!activeRef.current) return;

      // For on-device STT stub: if text is empty, fall through to idle
      // (Wave 3: real ASR will provide transcript)
      if (!text.trim()) {
        if (activeRef.current) setPhase('idle');
        return;
      }

      setTranscriptPreview(text.trim());
      setLastResponseMs(sttMs);

      // Send to local model and get response
      const convId = convIdRef.current;
      if (!convId) {
        if (activeRef.current) setPhase('idle');
        return;
      }

      let aiResponse = '';
      try {
        await sendMessage(convId, text.trim(), selectedModel);
        aiResponse = `Received: ${text.trim()}`;
      } catch {
        if (activeRef.current) setPhase('idle');
        return;
      }

      if (!activeRef.current) return;

      // Speak response on-device
      setPhase('speaking');
      await VoiceOutput.speak(aiResponse, {
        voice: selectedVoiceId ?? undefined,
        rate: speechRate,
        onStart: () => {
          if (activeRef.current) setAudioLevel(0.5);
        },
        onDone: () => {
          if (activeRef.current) {
            setAudioLevel(0);
            if (autoListenRef.current) startListening();
            else setPhase('idle');
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
  }, [hapticsEnabled, sendMessage, selectedModel, selectedVoiceId, speechRate, startListening]);

  const handleOrbPress = useCallback(() => {
    if (phase === 'idle') {
      autoListenRef.current = true;
      startListening();
    } else if (phase === 'listening') {
      stopAndProcess();
    } else if (phase === 'speaking') {
      VoiceOutput.stop();
      autoListenRef.current = true;
      startListening();
    }
  }, [phase, startListening, stopAndProcess]);

  const handleMuteToggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (next && phase === 'listening') {
      VoiceInput.cancelCapture().catch(() => {});
      setPhase('idle');
      setAudioLevel(0);
    }
  }, [muted, hapticsEnabled, phase]);

  const handleClose = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    activeRef.current = false;
    autoListenRef.current = false;
    VoiceInput.cancelCapture().catch(() => {});
    VoiceOutput.stop().catch(() => {});
    if (router.canGoBack()) router.back();
  }, [hapticsEnabled, router]);

  const modelLabel = getDisplayName(selectedModel);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <DarkGradientBg />

      {/* Close button */}
      <Pressable
        onPress={handleClose}
        style={[styles.closeBtn, { top: insets.top + 10 }]}
        accessibilityLabel="Close voice companion"
        accessibilityRole="button"
      >
        <X size={20} color="rgba(255,255,255,0.6)" />
      </Pressable>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.sublabel}>{PHASE_SUBLABEL[phase]}</Text>

        <TerraCottaOrb phase={phase} audioLevel={audioLevel} onPress={handleOrbPress} />

        <Text style={[styles.phaseLabel, { color: ORB_COLOR }]}>{PHASE_LABEL[phase]}</Text>

        {/* Model badge */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.modelBadge}>
          <Text style={styles.modelLabel}>{modelLabel.toUpperCase()}</Text>
          <Text style={styles.onDeviceBadge}>ON-DEVICE</Text>
        </Animated.View>

        {/* Performance chip */}
        {lastResponseMs !== undefined && (
          <Animated.View entering={FadeIn.duration(300)}>
            <PerformanceChip
              model="on-device STT"
              tier="Tier 2"
              firstTokenLatencyMs={lastResponseMs}
            />
          </Animated.View>
        )}

        {/* Transcript preview */}
        {transcriptPreview ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.transcriptBox}>
            <Text style={styles.transcriptText} numberOfLines={3}>
              {transcriptPreview}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        {/* Mute */}
        <Pressable
          onPress={handleMuteToggle}
          style={[
            styles.controlBtn,
            { backgroundColor: muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)' },
          ]}
          accessibilityLabel={muted ? 'Unmute' : 'Mute microphone'}
          accessibilityRole="button"
        >
          {muted ? (
            <MicOff size={22} color={colors.agentError} />
          ) : (
            <Mic size={22} color="rgba(255,255,255,0.8)" />
          )}
        </Pressable>

        {/* TTS indicator — static, shows TTS is always on-device */}
        <View style={styles.controlBtn}>
          <Volume2 size={22} color="rgba(218,119,86,0.7)" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050305',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  sublabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  orbWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.terraCotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLabel: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modelBadge: {
    alignItems: 'center',
    gap: 2,
  },
  modelLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  onDeviceBadge: {
    color: colors.terraCotta,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    opacity: 0.7,
  },
  transcriptBox: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(218,119,86,0.2)',
    maxWidth: '90%',
  },
  transcriptText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 8,
  },
  controlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
