import { View } from 'react-native';
import { Text } from './text';
import { useThemeColors } from '@/src/ui/theme';

interface AvatarProps {
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'user' | 'assistant';
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

const textSizes: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name, size = 'md', variant = 'user' }: AvatarProps) {
  const colors = useThemeColors();
  const isAssistant = variant === 'assistant';

  return (
    <View
      className={`${sizeClasses[size]} ${isAssistant ? '' : 'bg-blue-500'} rounded-full items-center justify-center`}
      style={isAssistant ? { backgroundColor: colors.teal } : undefined}
    >
      {/* The user circle sits on a saturated blue, so its label stays literal
          white. The assistant circle sits on the accent, whose readable
          on-colour is `accentText` (white on light, black on dark). */}
      <Text
        className={`${textSizes[size]} font-semibold`}
        style={{ color: isAssistant ? colors.accentText : colors.white }}
      >
        {name ? getInitials(name) : isAssistant ? 'AI' : 'U'}
      </Text>
    </View>
  );
}
