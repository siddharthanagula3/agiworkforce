import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

interface TextProps extends RNTextProps {
  variant?: 'default' | 'heading' | 'subheading' | 'caption' | 'mono';
}

const variantClasses: Record<NonNullable<TextProps['variant']>, string> = {
  default: 'text-sm text-white',
  heading: 'text-xl font-semibold text-white',
  subheading: 'text-base font-medium text-white',
  caption: 'text-xs text-white/60',
  mono: 'text-sm font-mono text-white',
};

export function Text({ variant = 'default', className = '', ...props }: TextProps) {
  return <RNText className={`${variantClasses[variant]} ${className}`} {...props} />;
}
