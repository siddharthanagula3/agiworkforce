/**
 * Transform-based slide-in for full-height sheets presented inside a `Modal`.
 *
 * Replaces `entering={SlideInDown...}` on the sheet container. The two are NOT
 * equivalent, and the difference is why this exists:
 *
 * Reanimated's `SlideInDown` is a LAYOUT animation — it drives the view's
 * origin, so every frame is a new layout pass for the sheet and all of its
 * children. These sheets are `flex: 1` with a centred `flex: 1` body holding an
 * `react-native-svg` gradient orb, so each of those passes re-measures the
 * column and re-rasterises the SVG. The result reads as a vertical jiggle
 * rather than a slide, and it is worst exactly where it is most visible: a
 * debug build on the Simulator, which has no GPU path to absorb the cost.
 *
 * A `translateY` transform composites on the existing layout instead. Children
 * are measured once, the orb rasterises once, and the motion is a single
 * property animating off the UI thread.
 *
 * The sheet's own height is not used as the travel distance — the window height
 * is, so the animation starts fully offscreen without needing an `onLayout`
 * measurement that would not be ready on the first frame.
 */

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

/** Matches the iOS sheet presentation curve closely enough to feel native. */
const SHEET_DURATION_MS = 300;

export interface UseSheetSlideInOptions {
  /** Mirrors the host `Modal`'s `visible` prop. */
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
  // Starts offscreen so the first committed frame is already correct. Seeding
  // this at 0 would flash the sheet in place before the animation began.
  const translateY = useSharedValue(height);

  useEffect(() => {
    if (visible) {
      // Re-seeded on every presentation: `Modal` keeps this subtree mounted
      // between showings, so a stale 0 from the previous open would skip the
      // animation entirely the second time the sheet is shown.
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
