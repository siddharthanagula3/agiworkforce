import { View } from 'react-native';
import { Text } from './text';
import { useThemeColors } from '@/src/ui/theme';

interface BadgeProps {
  label: string;
  color?: 'teal' | 'terra-cotta' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray';
}

export function Badge({ label, color = 'gray' }: BadgeProps) {
  const colors = useThemeColors();
  const tone = {
    teal: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accentBorder,
      color: colors.textPrimary,
    },
    'terra-cotta': {
      backgroundColor: colors.dangerSurface,
      borderColor: colors.dangerBorder,
      color: colors.agentError,
    },
    green: {
      backgroundColor: colors.successSurface,
      borderColor: colors.successBorder,
      color: colors.agentSuccess,
    },
    red: {
      backgroundColor: colors.dangerSurface,
      borderColor: colors.dangerBorder,
      color: colors.agentError,
    },
    yellow: {
      backgroundColor: colors.warningSurface,
      borderColor: colors.warningBorder,
      color: colors.agentWarning,
    },
    purple: {
      backgroundColor: colors.purpleSurface,
      borderColor: colors.neutralBorder,
      color: colors.purple,
    },
    blue: {
      backgroundColor: colors.accentSurface,
      borderColor: colors.accentBorder,
      color: colors.agentActive,
    },
    gray: {
      backgroundColor: colors.neutralSurface,
      borderColor: colors.neutralBorder,
      color: colors.textSecondary,
    },
  }[color];

  return (
    <View
      className="px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: tone.backgroundColor,
        borderColor: tone.borderColor,
        borderWidth: 1,
      }}
    >
      <Text
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: tone.color }}
      >
        {label}
      </Text>
    </View>
  );
}
