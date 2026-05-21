/**
 * ModelLoadingFirstRunModal — shown during the first inference after install
 * while the model is loading into memory.
 *
 * Shows a progress bar + ETA + reassurance copy.
 * Respects reduceMotion (no animated bar animation, just opacity transition).
 *
 * Props:
 *   visible    — whether to show the modal
 *   progress   — 0..1 (0 = just started, 1 = ready)
 *   etaSeconds — estimated seconds remaining (undefined = unknown)
 */
import { useEffect, useRef } from 'react';
import { Modal, View, Animated, AccessibilityInfo } from 'react-native';
import { Cpu } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import { EDGE_COPY } from './copy';
import { spacing, radii } from '@/lib/theme';

export interface ModelLoadingFirstRunModalProps {
  /** Controls modal visibility. */
  visible: boolean;
  /**
   * Loading progress, 0–1.
   * 0 = not started, 1 = fully loaded and modal should close.
   */
  progress: number;
  /**
   * Estimated seconds remaining. Omit when unknown.
   * Displayed as "About X remaining".
   */
  etaSeconds?: number;
}

function formatEta(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function ModelLoadingFirstRunModal({
  visible,
  progress,
  etaSeconds,
}: ModelLoadingFirstRunModalProps) {
  const colors = useThemeColors();
  const barWidth = useRef(new Animated.Value(0)).current;
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((val) => {
        reduceMotionRef.current = val;
      })
      .catch(() => {});
  }, []);

  // Animate the progress bar toward the new value
  useEffect(() => {
    const clampedProgress = Math.min(1, Math.max(0, progress));
    if (reduceMotionRef.current) {
      barWidth.setValue(clampedProgress);
    } else {
      Animated.timing(barWidth, {
        toValue: clampedProgress,
        duration: 300,
        useNativeDriver: false, // width animation cannot use native driver
      }).start();
    }
  }, [progress, barWidth]);

  const etaText =
    etaSeconds !== undefined && etaSeconds > 0
      ? `${EDGE_COPY.modelLoadingFirstRun.etaPrefix} ${formatEta(etaSeconds)} ${EDGE_COPY.modelLoadingFirstRun.etaSuffix}`
      : null;

  const percentText = `${Math.round(Math.min(100, progress * 100))}%`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing['2xl'],
        }}
      >
        <View
          style={{
            backgroundColor: colors.surfaceElevated,
            borderRadius: radii.xl,
            padding: spacing['2xl'],
            width: '100%',
            maxWidth: 360,
            alignItems: 'center',
            gap: spacing.lg,
          }}
          accessibilityRole="none"
          accessibilityLabel={EDGE_COPY.modelLoadingFirstRun.title}
        >
          {/* Icon */}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radii.full,
              backgroundColor: `${colors.teal}18`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={24} color={colors.teal} strokeWidth={2} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.textPrimary,
              textAlign: 'center',
            }}
          >
            {EDGE_COPY.modelLoadingFirstRun.title}
          </Text>

          {/* Progress bar track */}
          <View
            style={{
              width: '100%',
              height: 6,
              backgroundColor: `${colors.teal}25`,
              borderRadius: radii.full,
              overflow: 'hidden',
            }}
            accessibilityRole="progressbar"
            accessibilityLabel={`Loading ${percentText}`}
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — value props are valid on Android
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <Animated.View
              style={{
                height: '100%',
                backgroundColor: colors.teal,
                borderRadius: radii.full,
                width: barWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              }}
            />
          </View>

          {/* ETA / percent row */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            {etaText ? (
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{etaText}</Text>
            ) : (
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Loading…</Text>
            )}
            <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '600' }}>
              {percentText}
            </Text>
          </View>

          {/* Subtitle copy */}
          <Text
            style={{
              fontSize: 13,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 18,
            }}
          >
            {EDGE_COPY.modelLoadingFirstRun.subtitle}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
