import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

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

export function Text({ variant = 'default', className = '', style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style);
  const fontSize = typeof flattened?.fontSize === 'number' ? flattened.fontSize : null;
  const needsLineHeight = fontSize !== null && flattened?.lineHeight == null;
  const resolvedStyle = needsLineHeight
    ? [style, { lineHeight: Math.ceil(fontSize * 1.24) }]
    : style;

  return (
    <RNText
      className={`${variantClasses[variant]} ${className}`}
      style={resolvedStyle}
      {...props}
    />
  );
}
