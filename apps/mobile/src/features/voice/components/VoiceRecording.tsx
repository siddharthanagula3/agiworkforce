import { useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
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
import { colors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { formatClock } from '@/src/lib/time';

interface VoiceRecordingProps {
  visible: boolean;
  audioLevel: number;
  durationMs: number;
  onCancel: () => void;
  onSend: () => void;
}

function RecordingDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: motion.reveal }), -1, true);
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

  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      ringScale.value = withRepeat(withTiming(1.7, { duration: motion.pulse }), -1, true);
      ringOpacity.value = withRepeat(withTiming(0.4, { duration: motion.pulse }), -1, true);
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
      entering={FadeIn.duration(motion.quick)}
      exiting={FadeOut.duration(motion.quick)}
      style={styles.container}
      accessible
      accessibilityLabel="Voice recording in progress"
    >
      {/* Status row */}
      <View style={styles.statusRow}>
        <RecordingDot />
        <Text style={styles.recordingLabel}>Recording</Text>
        <Text style={styles.timer}>{formatClock(durationMs)}</Text>
      </View>

      {/* Orb + waveform */}
      <View style={styles.orbContainer}>
        {/* Outer pulsing ring */}
        <Animated.View style={[styles.ring, { backgroundColor: colors.terraCotta }, ringStyle]} />
        {/* Core orb */}
        <View style={[styles.orb, { backgroundColor: colors.terraCotta }]}>
          <Waveform
            color={colors.accentText}
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
        <PressableBox
          onPress={handleCancel}
          style={styles.cancelBtn}
          accessibilityLabel="Cancel recording"
          accessibilityRole="button"
        >
          <X size={22} color={colors.textSecondary} />
        </PressableBox>
        <PressableBox
          onPress={handleSend}
          style={[styles.sendBtn, { backgroundColor: colors.terraCotta }]}
          accessibilityLabel="Stop and send recording"
          accessibilityRole="button"
        >
          <Send size={22} color={colors.accentText} />
        </PressableBox>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.voiceSheetSurface,
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
    fontSize: typeScale.subhead,
    fontWeight: '600',
  },
  timer: {
    color: colors.voiceTextMuted,
    fontSize: typeScale.subhead,
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
    color: colors.voiceTextSubtle,
    fontSize: typeScale.caption,
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
    backgroundColor: colors.voiceControlSurface,
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
