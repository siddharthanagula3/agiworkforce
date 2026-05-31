import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useThemeColors } from '@/src/ui/theme';

/**
 * Skeleton placeholder for the message list while a conversation's history is
 * loading. Replaces the bare ActivityIndicator with a content-shaped shimmer so
 * the layout doesn't jump when messages arrive. Pure presentational; no data.
 */
function SkeletonRow({ align }: { align: 'left' | 'right' }) {
  const colors = useThemeColors();
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const isRight = align === 'right';

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isRight ? 'flex-end' : 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 8,
      }}
    >
      {!isRight && (
        <Animated.View
          style={[
            { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceElevated },
            shimmerStyle,
          ]}
        />
      )}
      <Animated.View
        style={[
          {
            maxWidth: '72%',
            gap: 6,
            padding: 12,
            borderRadius: 14,
            backgroundColor: colors.surfaceElevated,
          },
          shimmerStyle,
        ]}
      >
        <View style={{ height: 10, width: 180, borderRadius: 5, backgroundColor: colors.border }} />
        <View style={{ height: 10, width: 120, borderRadius: 5, backgroundColor: colors.border }} />
      </Animated.View>
    </View>
  );
}

export function MessageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ flex: 1, paddingTop: 12 }} accessibilityLabel="Loading messages">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} align={i % 2 === 0 ? 'left' : 'right'} />
      ))}
    </View>
  );
}
