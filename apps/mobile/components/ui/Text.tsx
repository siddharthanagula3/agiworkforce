import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

interface TextProps extends RNTextProps {
  variant?: 'default' | 'heading' | 'subheading' | 'caption' | 'mono' | 'inline';
}

const variantClasses: Record<NonNullable<TextProps['variant']>, string> = {
  default: 'text-sm text-white',
  heading: 'text-xl font-semibold text-white',
  subheading: 'text-base font-medium text-white',
  caption: 'text-sm text-white',
  mono: 'text-sm font-mono text-white',
  inline: '',
};

const HEADER_VARIANTS: ReadonlySet<NonNullable<TextProps['variant']>> = new Set([
  'heading',
  'subheading',
]);

export function Text({
  variant = 'default',
  className = '',
  style,
  accessibilityRole,
  ...props
}: TextProps) {
  const flattened = StyleSheet.flatten(style);
  const fontSize = typeof flattened?.fontSize === 'number' ? flattened.fontSize : null;
  // A nested span inherits its paragraph's line height; iOS takes the whole
  // paragraph's line height from the first span, so a derived one here would
  // collapse every line of a paragraph that opens with inline code.
  const needsLineHeight =
    variant !== 'inline' && fontSize !== null && flattened?.lineHeight == null;
  const resolvedStyle = needsLineHeight
    ? [style, { lineHeight: Math.ceil(fontSize * 1.24) }]
    : style;

  return (
    <RNText
      className={`${variantClasses[variant]} ${className}`}
      style={resolvedStyle}
      accessibilityRole={accessibilityRole ?? (HEADER_VARIANTS.has(variant) ? 'header' : undefined)}
      {...props}
    />
  );
}
