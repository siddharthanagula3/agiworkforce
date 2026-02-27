import { View } from 'react-native';

interface SeparatorProps {
  className?: string;
}

export function Separator({ className = '' }: SeparatorProps) {
  return <View className={`h-px bg-white/8 ${className}`} />;
}
