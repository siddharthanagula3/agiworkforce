import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated' | 'outline';
}

const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-surface-elevated rounded-xl',
  elevated: 'bg-surface-overlay rounded-xl',
  outline: 'bg-transparent rounded-xl border border-white/10',
};

export function Card({ variant = 'default', className = '', ...props }: CardProps) {
  return <View className={`p-4 ${variantClasses[variant]} ${className}`} {...props} />;
}
