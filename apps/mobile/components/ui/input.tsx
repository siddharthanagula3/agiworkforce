import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './text';
import { useThemeColors } from '@/src/ui/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, className = '', style, ...props }: InputProps,
  ref,
) {
  const colors = useThemeColors();

  return (
    <View className="gap-1.5">
      {label && (
        <Text className="text-sm" style={{ color: colors.textSecondary }}>
          {label}
        </Text>
      )}
      <TextInput
        ref={ref}
        className={className}
        style={[
          {
            height: 44,
            paddingHorizontal: 12,
            borderRadius: 8,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: error ? colors.agentError : colors.border,
            color: colors.textPrimary,
          },
          style,
        ]}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.teal}
        accessibilityLabel={label}
        accessibilityHint={error ? `Error: ${error}` : undefined}
        {...props}
      />
      {error && (
        <Text className="text-xs" style={{ color: colors.agentError }}>
          {error}
        </Text>
      )}
    </View>
  );
});
