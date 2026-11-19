import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SideScroller } from '@/src/features/chat/components/SideScroller';
import { useCodePreferences } from './store';

export interface CodeLinesCap {
  maxHeight: number;
  fadeColor: string;
  fadeHeight: number;
}

const FADE_GRADIENT_ID = 'codeCapFade';

function CodeCapFade({ color, height }: { color: string; height: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="code-cap-fade"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}
    >
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id={FADE_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0" />
            <Stop offset="1" stopColor={color} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill={`url(#${FADE_GRADIENT_ID})`} />
      </Svg>
    </View>
  );
}

export function CodeLinesScroller({
  children,
  style,
  contentContainerStyle,
  alwaysWrap = false,
  showsIndicator = false,
  testID,
  cap,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  alwaysWrap?: boolean;
  showsIndicator?: boolean;
  testID?: string;
  cap?: CodeLinesCap;
}) {
  const wrapLongLines = useCodePreferences((state) => state.wrapLongLines);

  const lines =
    alwaysWrap || wrapLongLines ? (
      <View testID={testID} style={contentContainerStyle ? [style, contentContainerStyle] : style}>
        {children}
      </View>
    ) : (
      <SideScroller
        testID={testID}
        showsHorizontalScrollIndicator={showsIndicator}
        scrollEventThrottle={16}
        style={cap ? [style, { flexShrink: 0 }] : style}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </SideScroller>
    );

  if (!cap) return lines;

  return (
    <View testID="code-cap" style={{ maxHeight: cap.maxHeight, overflow: 'hidden' }}>
      {lines}
      <CodeCapFade color={cap.fadeColor} height={cap.fadeHeight} />
    </View>
  );
}
