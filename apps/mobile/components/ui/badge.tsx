import { View } from 'react-native';
import { Text } from './text';

interface BadgeProps {
  label: string;
  color?: 'teal' | 'terra-cotta' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray';
}

const colorClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  teal: 'bg-teal-500/20',
  'terra-cotta': 'bg-terra-cotta-500/20',
  green: 'bg-emerald-500/20',
  red: 'bg-red-500/20',
  yellow: 'bg-amber-500/20',
  purple: 'bg-purple-500/20',
  blue: 'bg-blue-500/20',
  gray: 'bg-white/10',
};

const textClasses: Record<NonNullable<BadgeProps['color']>, string> = {
  teal: 'text-teal-400',
  'terra-cotta': 'text-terra-cotta-300',
  green: 'text-emerald-400',
  red: 'text-red-400',
  yellow: 'text-amber-400',
  purple: 'text-purple-400',
  blue: 'text-blue-400',
  gray: 'text-white/60',
};

export function Badge({ label, color = 'gray' }: BadgeProps) {
  return (
    <View className={`px-2 py-0.5 rounded-full ${colorClasses[color]}`}>
      <Text className={`text-[10px] font-medium uppercase tracking-wider ${textClasses[color]}`}>
        {label}
      </Text>
    </View>
  );
}
