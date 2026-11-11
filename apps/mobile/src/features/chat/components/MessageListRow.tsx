import { useCallback, useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useFlashListContext } from '@shopify/flash-list';

const HEIGHT_CHANGE_THRESHOLD = 1;

export function MessageListRow({
  messageId,
  style,
  children,
}: {
  messageId: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const list = useFlashListContext();
  const measured = useRef<{ messageId: string; height: number } | null>(null);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      const previous = measured.current;
      measured.current = { messageId, height };
      if (
        previous?.messageId === messageId &&
        Math.abs(previous.height - height) >= HEIGHT_CHANGE_THRESHOLD
      ) {
        list?.layout();
      }
    },
    [list, messageId],
  );

  return (
    <View testID="chat.message-row" style={style} onLayout={handleLayout}>
      {children}
    </View>
  );
}
