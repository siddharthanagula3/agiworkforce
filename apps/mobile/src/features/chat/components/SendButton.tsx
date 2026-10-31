import { PressableBox } from '@/components/ui/PressableBox';
import { ArrowUp, Square, Clock } from 'lucide-react-native';
import { useThemeColors, radii } from '@/src/ui/theme';

type SendButtonState = 'idle' | 'streaming' | 'queued';

interface SendButtonProps {
  state: SendButtonState;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

function iconForState(state: SendButtonState) {
  if (state === 'streaming') return Square;
  if (state === 'queued') return Clock;
  return ArrowUp;
}

function fillForState(state: SendButtonState, color: string) {
  return state === 'streaming' ? color : undefined;
}

export function SendButton({ state, onPress, disabled, accessibilityLabel }: SendButtonProps) {
  const colors = useThemeColors();
  const isDisabled = Boolean(disabled && state === 'idle');
  const iconColor = isDisabled ? colors.textSecondary : colors.surfaceBase;
  const Icon = iconForState(state);

  return (
    <PressableBox
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDisabled
          ? colors.neutralSurface
          : pressed
            ? colors.textSecondary
            : colors.textPrimary,
      })}
      accessibilityLabel={
        accessibilityLabel ??
        (state === 'idle' ? 'Send message' : state === 'streaming' ? 'Stop generating' : 'Queued')
      }
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      <Icon size={16} color={iconColor} fill={fillForState(state, iconColor)} />
    </PressableBox>
  );
}
