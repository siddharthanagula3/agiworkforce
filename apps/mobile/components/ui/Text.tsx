import { useContext } from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useCodeFontFamily } from '@/src/features/settings/code/useCodeAppearance';
import { TextScaleContext } from './textScale';
import { TranscriptFontContext } from './transcriptFont';

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

export function Text(props: TextProps) {
  return props.variant === 'mono' ? <MonoText {...props} /> : <StyledText {...props} />;
}

function MonoText(props: TextProps) {
  const codeFontFamily = useCodeFontFamily();
  return <StyledText {...props} fontFamily={codeFontFamily} />;
}

function StyledText({
  variant = 'default',
  className = '',
  style,
  accessibilityRole,
  fontFamily,
  ...props
}: TextProps & { fontFamily?: string }) {
  const fontScale = useContext(TextScaleContext);
  const transcriptFontFamily = useContext(TranscriptFontContext);
  const face = fontFamily ?? transcriptFontFamily;
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
  const faceStyle =
    face && variant !== 'inline' ? [{ fontFamily: face }, resolvedStyle] : resolvedStyle;

  const setsOwnFace = fontFamily !== undefined || typeof flattened?.fontFamily === 'string';
  const children =
    setsOwnFace && transcriptFontFamily !== null ? (
      <TranscriptFontContext.Provider value={null}>{props.children}</TranscriptFontContext.Provider>
    ) : (
      props.children
    );

  // A text-size change made while the app is open can leave a label drawn at
  // the new size inside a box measured at the old one. A fresh text node per
  // scale is measured again; the screens and navigation around it stay mounted.
  return (
    <RNText
      key={fontScale === null ? undefined : `text-scale-${fontScale}`}
      className={`${variantClasses[variant]} ${className}`}
      style={faceStyle}
      accessibilityRole={accessibilityRole ?? (HEADER_VARIANTS.has(variant) ? 'header' : undefined)}
      {...props}
    >
      {children}
    </RNText>
  );
}
