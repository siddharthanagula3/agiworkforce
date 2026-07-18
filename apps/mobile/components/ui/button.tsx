import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8 },
  md: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10 },
  lg: { minHeight: 52, paddingHorizontal: 24, borderRadius: 14 },
};

const baseStyle: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onPress,
  className,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [pressed, setPressed] = useState(false);

  const handlePress = (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  const { style, onPressIn, onPressOut, ...rest } = props;

  const handlePressIn: NonNullable<PressableProps['onPressIn']> = (event) => {
    setPressed(true);
    onPressIn?.(event);
  };

  const handlePressOut: NonNullable<PressableProps['onPressOut']> = (event) => {
    setPressed(false);
    onPressOut?.(event);
  };

  const variantStyle = (pressed: boolean): ViewStyle => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: pressed ? colors.surfaceHover : colors.terraCotta,
        };
      case 'outline':
        return {
          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          borderWidth: 1,
          borderColor: colors.border,
        };
      case 'ghost':
        return {
          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
        };
      case 'destructive':
        return {
          backgroundColor: pressed ? colors.dangerBorder : colors.dangerSurface,
          borderWidth: 1,
          borderColor: colors.dangerBorder,
        };
      case 'primary':
      default:
        return {
          backgroundColor: pressed ? colors.textPrimary : colors.teal,
        };
    }
  };

  const textColor = {
    primary: colors.accentText,
    secondary: colors.accentText,
    outline: colors.textPrimary,
    ghost: colors.textSecondary,
    destructive: colors.agentError,
  }[variant];

  return (
    <Pressable
      className={className || undefined}
      style={StyleSheet.flatten([
        baseStyle,
        sizeStyles[size],
        variantStyle(pressed),
        disabled || loading ? { opacity: 0.5 } : null,
        typeof style === 'function' ? style({ pressed } as PressableStateCallbackType) : style,
      ])}
      disabled={disabled || loading}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      {...rest}
    >
      <Text style={{ color: textColor, fontSize: 14, fontWeight: '500' }}>
        {loading ? 'Loading...' : title}
      </Text>
    </Pressable>
  );
}
