import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { EDGE_COPY } from './copy';
import { spacing } from '@/src/ui/theme';

export function OfflineBanner() {
  const colors = useThemeColors();
  const { isOnline } = useNetworkStatus();
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    const show = !isOnline;

    if (show) {
      if (reduceMotion) {
        translateY.setValue(0);
        opacity.setValue(1);
      } else {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else {
      if (reduceMotion) {
        translateY.setValue(-60);
        opacity.setValue(0);
      } else {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -60,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }, [isOnline, reduceMotion, translateY, opacity]);

  return (
    <Animated.View
      style={{
        transform: [{ translateY }],
        opacity,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: colors.teal,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }}
      accessibilityRole="alert"
      accessibilityLabel={EDGE_COPY.offline.banner}
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore, accessibilityLiveRegion is a valid prop on Android; TS defs are incomplete
      accessibilityLiveRegion="polite"
    >
      <WifiOff size={14} color={colors.accentText} strokeWidth={2} />
      <Text
        style={{
          color: colors.accentText,
          fontSize: 12,
          fontWeight: '600',
          flexShrink: 1,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {EDGE_COPY.offline.banner}
      </Text>
    </Animated.View>
  );
}
