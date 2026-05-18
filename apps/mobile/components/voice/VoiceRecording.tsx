/**
 * VoiceRecording — fullscreen recording UI.
 *
 * Shows an animated waveform, elapsed time, and Cancel / Send controls.
 * Used inside the voice companion flow and as a standalone sheet.
 */

import { useEffect, useCallback } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { X, Send } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Waveform } from './Waveform';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

interface VoiceRecordingProps {
  /** Whether the recording panel is visible */
  visible: boolean;
  /** Normalized audio level 0–1 from metering callbacks */
  audioLevel: number;
  /** Elapsed recording time in milliseconds */
  durationMs: number;
  /** User tapped cancel */
  onCancel: () => void;
  /** User confirmed — stop recording and proceed to review */
  onSend: () => void;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function RecordingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: 700 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.terraCotta },
        style,
      ]}
    />
  );
}

export function VoiceRecording({
  visible,
  audioLevel,
  durationMs,
  onCancel,
  onSend,
}: VoiceRecordingProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  // Outer ring pulse when active
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      ringScale.value = withRepeat(withTiming(1.7, { duration: 1100 }), -1, true);
      ringOpacity.value = withRepeat(withTiming(0.4, { duration: 1100 }), -1, true);
    } else {
      ringScale.value = withSpring(1);
      ringOpacity.value = withSpring(0);
    }
  }, [visible, ringScale, ringOpacity]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const handleCancel = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCancel();
  }, [hapticsEnabled, onCancel]);

  const handleSend = useCallback(() => {
    if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSend();
  }, [hapticsEnabled, onSend]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={styles.container}
      accessible
      accessibilityLabel="Voice recording in progress"
    >
      {/* Status row */}
      <View style={styles.statusRow}>
        <RecordingDot />
        <Text style={styles.recordingLabel}>Recording</Text>
        <Text style={styles.timer}>{formatMs(durationMs)}</Text>
      </View>

      {/* Orb + waveform */}
      <View style={styles.orbContainer}>
        {/* Outer pulsing ring */}
        <Animated.View style={[styles.ring, { backgroundColor: colors.terraCotta }, ringStyle]} />
        {/* Core orb */}
        <View style={[styles.orb, { backgroundColor: colors.terraCotta }]}>
          <Waveform
            color={colors.white}
            active
            audioLevel={audioLevel}
            barCount={5}
            maxHeight={34}
            minHeight={6}
            barWidth={4}
            gap={5}
          />
        </View>
      </View>

      <Text style={styles.hint}>Tap send when done speaking</Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleCancel}
          style={styles.cancelBtn}
          accessibilityLabel="Cancel recording"
          accessibilityRole="button"
        >
          <X size={22} color={colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={handleSend}
          style={[styles.sendBtn, { backgroundColor: colors.terraCotta }]}
          accessibilityLabel="Stop and send recording"
          accessibilityRole="button"
        >
          <Send size={22} color={colors.white} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(12,12,16,0.97)',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 20,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingLabel: {
    color: colors.terraCotta,
    fontSize: 14,
    fontWeight: '600',
  },
  timer: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    marginLeft: 4,
  },
  orbContainer: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  orb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
    marginTop: 4,
  },
  cancelBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
