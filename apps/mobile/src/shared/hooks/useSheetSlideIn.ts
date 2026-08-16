
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

const SHEET_DURATION_MS = 300;

export interface UseSheetSlideInOptions {
  visible: boolean;
  /** Override the travel duration; defaults to {@link SHEET_DURATION_MS}. */
  durationMs?: number;
}

/**
 * @returns An animated style to spread onto the sheet container.
 */
export function useSheetSlideIn({
  visible,
  durationMs = SHEET_DURATION_MS,
}: UseSheetSlideInOptions): AnimatedStyle<ViewStyle> {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);

  useEffect(() => {
    if (visible) {
      translateY.value = height;
      translateY.value = withTiming(0, {
        duration: durationMs,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = height;
    }
  }, [visible, height, durationMs, translateY]);

  return useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
}
