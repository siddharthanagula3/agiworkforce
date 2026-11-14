import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useCodePreferences } from './store';

export function CodeLinesScroller({
  children,
  style,
  contentContainerStyle,
  alwaysWrap = false,
  showsIndicator = false,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  alwaysWrap?: boolean;
  showsIndicator?: boolean;
  testID?: string;
}) {
  const wrapLongLines = useCodePreferences((state) => state.wrapLongLines);

  if (alwaysWrap || wrapLongLines) {
    return (
      <View testID={testID} style={contentContainerStyle ? [style, contentContainerStyle] : style}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={showsIndicator}
      scrollEventThrottle={16}
      style={style}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  );
}
