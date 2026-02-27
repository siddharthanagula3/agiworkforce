import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './text';
import { useSettingsStore } from '@/stores/settingsStore';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-teal-500 active:bg-teal-600',
  secondary: 'bg-terra-cotta-500 active:bg-terra-cotta-600',
  outline: 'border border-white/10 active:bg-white/5',
  ghost: 'active:bg-white/5',
  destructive: 'bg-red-500/20 active:bg-red-500/30',
};

const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 rounded-md',
  md: 'h-11 px-4 rounded-lg',
  lg: 'h-13 px-6 rounded-xl',
};

const textVariantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-white font-medium',
  secondary: 'text-white font-medium',
  outline: 'text-white font-medium',
  ghost: 'text-white/80 font-medium',
  destructive: 'text-red-400 font-medium',
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onPress,
  className = '',
  ...props
}: ButtonProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handlePress = (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  return (
    <Pressable
      className={`items-center justify-center flex-row ${variantClasses[variant]} ${sizeClasses[size]} ${
        (disabled || loading) ? 'opacity-50' : ''
      } ${className}`}
      disabled={disabled || loading}
      onPress={handlePress}
      {...props}
    >
      <Text className={`text-sm ${textVariantClasses[variant]}`}>
        {loading ? 'Loading...' : title}
      </Text>
    </Pressable>
  );
}
