import { View } from 'react-native';
import { Text } from './text';

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
  const bgClass = variant === 'assistant'
    ? 'bg-teal-500'
    : 'bg-blue-500';

  return (
    <View className={`${sizeClasses[size]} ${bgClass} rounded-full items-center justify-center`}>
      <Text className={`${textSizes[size]} font-semibold text-white`}>
        {name ? getInitials(name) : variant === 'assistant' ? 'AI' : 'U'}
      </Text>
    </View>
  );
}
