import { useEffect } from 'react';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { FLOATING_PRIMARY_ACTION_LIST_PADDING } from '@/src/shared/components/FloatingPrimaryAction';
import { contentColumnWidth } from '@/src/shared/layout/contentColumn';
import { elevation, motion, radii, spacing, useThemeColors, zIndex } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useReduceMotion } from '@/src/ui/theme/useReduceMotion';

const TOAST_DURATION_MS = 5_000;
const TOAST_ACTION_DURATION_MS = 8_000;
const TOAST_TAP_GUARD_MS = 400;
const TOAST_MAX_WIDTH = 520;

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
  guard: ToastEntry | null;
  show: (message: string, action?: ToastAction) => void;
  dismiss: (id: number) => void;
  releaseGuard: (id: number) => void;
}

let nextToastId = 0;

const useToastStore = create<ToastState>()((set) => ({
  current: null,
  guard: null,
  show: (message, action) => {
    nextToastId += 1;
    set({ current: { id: nextToastId, message, ...(action ? { action } : {}) }, guard: null });
  },
  dismiss: (id) =>
    set((state) =>
      state.current?.id === id
        ? { current: null, guard: state.current.action ? state.current : null }
        : state,
    ),
  releaseGuard: (id) => set((state) => (state.guard?.id === id ? { guard: null } : state)),
}));

export function showToast(message: string, action?: ToastAction): void {
  useToastStore.getState().show(message, action);
}

function ToastBody({
  entry,
  inert,
  onAction,
}: {
  entry: ToastEntry;
  inert?: boolean;
  onAction?: () => void;
}) {
  const colors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const maxWidth = Math.min(
    TOAST_MAX_WIDTH,
    contentColumnWidth('reading', windowWidth - 2 * spacing.lg),
  );
  return (
    <View
      testID={inert ? 'toast-tap-guard' : 'toast-body'}
      accessibilityElementsHidden={inert}
      importantForAccessibility={inert ? 'no-hide-descendants' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        maxWidth,
        minHeight: 44,
        paddingLeft: spacing.lg,
        paddingRight: entry.action ? spacing.sm : spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: inert ? colors.transparent : colors.border,
        backgroundColor: inert ? colors.transparent : colors.surfaceElevated,
        ...(inert ? {} : elevation.e2),
      }}
    >
      <Text
        style={{
          flexShrink: 1,
          color: colors.textPrimary,
          fontSize: typeScale.subhead,
          opacity: inert ? 0 : 1,
        }}
      >
        {entry.message}
      </Text>
      {entry.action ? (
        <Pressable
          onPress={onAction}
          disabled={inert}
          accessibilityRole="button"
          accessibilityLabel={entry.action.label}
          style={{
            flexShrink: 0,
            minHeight: 44,
            minWidth: 44,
            paddingHorizontal: spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: inert ? 0 : 1,
          }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '600' }}
          >
            {entry.action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const current = useToastStore((s) => s.current);
  const guard = useToastStore((s) => s.guard);
  const dismiss = useToastStore((s) => s.dismiss);
  const releaseGuard = useToastStore((s) => s.releaseGuard);

  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDismiss = (durationMs: number) => {
      if (cancelled) return;
      timer = setTimeout(() => dismiss(current.id), durationMs);
    };
    if (current.action) {
      AccessibilityInfo.getRecommendedTimeoutMillis(TOAST_ACTION_DURATION_MS).then(
        (recommendedMs) => scheduleDismiss(Math.max(TOAST_ACTION_DURATION_MS, recommendedMs)),
        () => scheduleDismiss(TOAST_ACTION_DURATION_MS),
      );
    } else {
      scheduleDismiss(TOAST_DURATION_MS);
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [current, dismiss]);

  useEffect(() => {
    if (!guard) return;
    const timer = setTimeout(() => releaseGuard(guard.id), TOAST_TAP_GUARD_MS);
    return () => clearTimeout(timer);
  }, [guard, releaseGuard]);

  if (!current && !guard) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: insets.bottom + FLOATING_PRIMARY_ACTION_LIST_PADDING,
        alignItems: 'center',
        zIndex: zIndex.notification,
      }}
    >
      {current ? (
        <Animated.View
          key={current.id}
          entering={reduceMotion ? undefined : FadeInDown.duration(motion.quick)}
          exiting={reduceMotion ? undefined : FadeOutDown.duration(motion.quick)}
          accessibilityLiveRegion="polite"
        >
          <ToastBody
            entry={current}
            onAction={() => {
              dismiss(current.id);
              current.action?.onPress();
            }}
          />
        </Animated.View>
      ) : guard ? (
        <ToastBody entry={guard} inert />
      ) : null}
    </View>
  );
}
