import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { elevation, motion, radii, spacing, useThemeColors, zIndex } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';

const TOAST_DURATION_MS = 5_000;

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastEntry {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  current: ToastEntry | null;
  show: (message: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
}

let nextToastId = 0;

const useToastStore = create<ToastState>()((set) => ({
  current: null,
  show: (message, action) => {
    nextToastId += 1;
    set({ current: { id: nextToastId, message, ...(action ? { action } : {}) } });
  },
  dismiss: (id) => set((state) => (state.current?.id === id ? { current: null } : state)),
}));

export function showToast(message: string, action?: ToastAction): void {
  useToastStore.getState().show(message, action);
}

export function ToastHost() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    const timer = setTimeout(() => dismiss(current.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  if (!current) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: insets.bottom + spacing['3xl'] + spacing['4xl'],
        alignItems: 'center',
        zIndex: zIndex.notification,
      }}
    >
      <Animated.View
        key={current.id}
        entering={reduceMotion ? undefined : FadeInDown.duration(motion.quick)}
        exiting={reduceMotion ? undefined : FadeOutDown.duration(motion.quick)}
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          maxWidth: 520,
          minHeight: 44,
          paddingLeft: spacing.lg,
          paddingRight: current.action ? spacing.sm : spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          ...elevation.e2,
        }}
      >
        <Text style={{ flexShrink: 1, color: colors.textPrimary, fontSize: typeScale.subhead }}>
          {current.message}
        </Text>
        {current.action ? (
          <Pressable
            onPress={() => {
              dismiss(current.id);
              current.action?.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
            style={{
              minHeight: 44,
              minWidth: 44,
              paddingHorizontal: spacing.md,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
            >
              {current.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
