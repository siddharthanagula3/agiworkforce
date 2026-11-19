import { useRef, useState, type ReactNode } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';

export type SurfaceTone = 'success' | 'danger' | 'warning' | 'neutral';

const MIN_TARGET = 44;
const MARK_SIZE = 22;
const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;
const ACCESSIBLE_SLIDER_STEPS = 20;

export function SurfacePanel({
  colors,
  children,
  testID,
  accessibilityLabel,
}: {
  colors: ColorScheme;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={{
        marginVertical: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.lg,
        backgroundColor: colors.background,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export function PanelHeader({
  title,
  aside,
  colors,
}: {
  title: string;
  aside?: ReactNode;
  colors: ColorScheme;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{
          flexShrink: 1,
          color: colors.textPrimary,
          fontSize: typeScale.subhead,
          fontWeight: '600',
        }}
      >
        {title}
      </Text>
      {typeof aside === 'string' ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>{aside}</Text>
      ) : (
        aside
      )}
    </View>
  );
}

export function PanelSection({
  colors,
  children,
  divided = false,
  gap = spacing.sm,
}: {
  colors: ColorScheme;
  children: ReactNode;
  divided?: boolean;
  gap?: number;
}) {
  return (
    <View
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap,
        ...(divided ? { borderTopWidth: 1, borderTopColor: colors.borderLight } : {}),
      }}
    >
      {children}
    </View>
  );
}

export function StatusPill({
  label,
  tone,
  colors,
}: {
  label: string;
  tone: SurfaceTone;
  colors: ColorScheme;
}) {
  const palette = {
    success: {
      background: colors.successSurface,
      border: colors.successBorder,
      text: colors.agentSuccess,
    },
    danger: {
      background: colors.dangerSurface,
      border: colors.dangerBorder,
      text: colors.agentError,
    },
    warning: {
      background: colors.warningSurface,
      border: colors.warningBorder,
      text: colors.agentWarning,
    },
    neutral: {
      background: colors.neutralSurface,
      border: colors.neutralBorder,
      text: colors.textSecondary,
    },
  }[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: palette.text, fontSize: typeScale.caption, fontWeight: '500' }}
      >
        {label}
      </Text>
    </View>
  );
}

function ChoiceMark({
  kind,
  checked,
  colors,
}: {
  kind: 'checkbox' | 'radio';
  checked: boolean;
  colors: ColorScheme;
}) {
  const round = kind === 'radio';
  return (
    <View
      style={{
        width: MARK_SIZE,
        height: MARK_SIZE,
        borderRadius: round ? MARK_SIZE / 2 : radii.sm,
        borderWidth: 1.5,
        borderColor: checked ? colors.teal : colors.textSecondary,
        backgroundColor: checked && !round ? colors.teal : colors.transparent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && round ? (
        <View
          style={{
            width: MARK_SIZE / 2,
            height: MARK_SIZE / 2,
            borderRadius: MARK_SIZE / 4,
            backgroundColor: colors.teal,
          }}
        />
      ) : null}
      {checked && !round ? <Check size={16} color={colors.background} strokeWidth={3} /> : null}
    </View>
  );
}

export function ChoiceRow({
  kind,
  label,
  checked,
  onPress,
  colors,
  disabled = false,
}: {
  kind: 'checkbox' | 'radio';
  label: string;
  checked: boolean;
  onPress: () => void;
  colors: ColorScheme;
  disabled?: boolean;
}) {
  return (
    <PressableBox
      accessibilityRole={kind}
      accessibilityState={
        kind === 'radio' ? { selected: checked, disabled } : { checked, disabled }
      }
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: MIN_TARGET,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <ChoiceMark kind={kind} checked={checked} colors={colors} />
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>{label}</Text>
    </PressableBox>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SliderControl({
  label,
  min,
  max,
  value,
  onChange,
  colors,
  disabled = false,
  valueText,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  colors: ColorScheme;
  disabled?: boolean;
  valueText?: string;
}) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, min, max, onChange, disabled, grantX: 0 });
  latest.current = { ...latest.current, width, min, max, onChange, disabled };

  const valueAt = (x: number): number => {
    const state = latest.current;
    if (state.width <= 0) return state.min;
    const fraction = clamp(x / state.width, 0, 1);
    return Math.round(state.min + fraction * (state.max - state.min));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        latest.current.grantX = event.nativeEvent.locationX;
        latest.current.onChange(valueAt(latest.current.grantX));
      },
      onPanResponderMove: (_event, gesture) => {
        latest.current.onChange(valueAt(latest.current.grantX + gesture.dx));
      },
    }),
  ).current;

  const span = max - min;
  const fraction = span > 0 ? clamp((value - min) / span, 0, 1) : 0;
  const step = Math.max(1, Math.round(span / ACCESSIBLE_SLIDER_STEPS));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value, ...(valueText ? { text: valueText } : {}) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (disabled) return;
        const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
        onChange(clamp(value + delta, min, max));
      }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={{ height: MIN_TARGET, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
      {...responder.panHandlers}
    >
      <View
        pointerEvents="none"
        style={{
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: colors.progressTrack,
        }}
      >
        <View
          style={{
            width: `${fraction * 100}%`,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.teal,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: Math.max(0, fraction * width - THUMB_SIZE / 2),
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: THUMB_SIZE / 2,
          backgroundColor: colors.teal,
          borderWidth: 2,
          borderColor: colors.background,
        }}
      />
    </View>
  );
}

export function SelectControl({
  label,
  options,
  value,
  placeholder,
  onChange,
  colors,
  disabled = false,
}: {
  label: string;
  options: readonly string[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  colors: ColorScheme;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <PressableBox
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || placeholder}`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen((shown) => !shown)}
        style={{
          minHeight: MIN_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.md,
          paddingHorizontal: spacing.md,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: value ? colors.textPrimary : colors.textMuted,
            fontSize: typeScale.body,
          }}
        >
          {value || placeholder}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={18} color={colors.textSecondary} />
        </View>
      </PressableBox>
      {open
        ? options.map((option) => (
            <ChoiceRow
              key={option}
              kind="radio"
              label={option}
              checked={option === value}
              colors={colors}
              onPress={() => {
                onChange(option);
                setOpen(false);
              }}
            />
          ))
        : null}
    </View>
  );
}
