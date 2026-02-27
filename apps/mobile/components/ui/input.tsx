import { TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <View className="gap-1.5">
      {label && <Text className="text-sm text-white/70">{label}</Text>}
      <TextInput
        className={`h-11 px-3 rounded-lg bg-surface-elevated border ${
          error ? 'border-red-500' : 'border-white/10'
        } text-white placeholder:text-white/30 ${className}`}
        placeholderTextColor="rgba(255,255,255,0.3)"
        selectionColor="#21808d"
        {...props}
      />
      {error && <Text className="text-xs text-red-400">{error}</Text>}
    </View>
  );
}
