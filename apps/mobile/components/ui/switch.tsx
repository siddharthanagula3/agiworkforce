import { Switch as NativeSwitch } from 'react-native';
import { useThemeColors } from '@/src/ui/theme';

interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Switch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: SwitchProps) {
  const colors = useThemeColors();

  return (
    <NativeSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.surfaceHover, true: colors.agentSuccess }}
      thumbColor={colors.white}
      ios_backgroundColor={colors.surfaceHover}
      style={{ opacity: disabled ? 0.65 : 1 }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled }}
    />
  );
}
