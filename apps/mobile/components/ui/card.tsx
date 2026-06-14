import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/src/ui/theme';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outline';
}

export function Card({ variant = 'default', className = '', ...props }: CardProps) {
  const colors = useThemeColors();
  const variantStyle: Record<NonNullable<CardProps['variant']>, ViewStyle> = {
    default: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
    },
    elevated: {
      backgroundColor: colors.surfaceOverlay,
      borderWidth: 1,
      borderColor: colors.border,
    },
    outline: {
      backgroundColor: colors.transparent,
      borderWidth: 1,
      borderColor: colors.border,
    },
  };

  const { style, ...rest } = props;
  return (
    <View
      className={`p-4 rounded-xl ${className}`}
      style={StyleSheet.flatten([variantStyle[variant], style])}
      {...rest}
    />
  );
}
