import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useFlashListContext } from '@shopify/flash-list';

const HEIGHT_CHANGE_THRESHOLD = 1;

export function MessageListRow({
  messageId,
  streaming,
  style,
  children,
}: {
  messageId: string;
  streaming: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const list = useFlashListContext();
  const measured = useRef<{ messageId: string; height: number } | null>(null);
  const pendingFrame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    },
    [],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      const previous = measured.current;
      measured.current = { messageId, height };
      if (
        streaming ||
        previous?.messageId !== messageId ||
        Math.abs(previous.height - height) < HEIGHT_CHANGE_THRESHOLD ||
        pendingFrame.current !== null
      ) {
        return;
      }
      pendingFrame.current = requestAnimationFrame(() => {
        pendingFrame.current = null;
        list?.layout();
      });
    },
    [list, messageId, streaming],
  );

  return (
    <View testID="chat.message-row" style={style} onLayout={handleLayout}>
      {children}
    </View>
  );
}
