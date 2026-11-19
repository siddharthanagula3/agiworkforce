import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  ScrollView as NativeScrollView,
  type LayoutChangeEvent,
  type ScrollViewProps,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export type SideScrollerRef = RefObject<NativeScrollView | null>;
export type RegisterSideScroller = (ref: SideScrollerRef) => () => void;

export const SideScrollerRegistry = createContext<RegisterSideScroller | null>(null);

export type SideScrollerProps = Omit<ScrollViewProps, 'horizontal'> & {
  children: ReactNode;
  ref?: Ref<NativeScrollView>;
};

function assignRef<T>(target: Ref<T> | undefined, value: T | null): void {
  if (typeof target === 'function') target(value);
  else if (target) target.current = value;
}

/**
 * A sideways scroller inside a chat answer. While its content is wider than
 * its frame, the row's swipe-to-reply waits for it, so a drag that starts on
 * it scrolls it. Outside a swipeable row it is a plain scroller.
 */
export function SideScroller(scrollerProps: SideScrollerProps) {
  const { children, onLayout, onContentSizeChange, ref: callerRef, ...props } = scrollerProps;
  const register = useContext(SideScrollerRegistry);
  const ref = useRef<NativeScrollView>(null);
  const attachRef = useCallback(
    (node: NativeScrollView | null) => {
      ref.current = node;
      assignRef(callerRef, node);
    },
    [callerRef],
  );
  const [frameWidth, setFrameWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const overflows = frameWidth > 0 && contentWidth > frameWidth + 1;

  useEffect(() => (register && overflows ? register(ref) : undefined), [register, overflows]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setFrameWidth(event.nativeEvent.layout.width);
      onLayout?.(event);
    },
    [onLayout],
  );
  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      setContentWidth(width);
      onContentSizeChange?.(width, height);
    },
    [onContentSizeChange],
  );

  if (!register) return <NativeScrollView horizontal {...scrollerProps} />;

  return (
    <ScrollView
      ref={attachRef}
      horizontal
      alwaysBounceHorizontal={false}
      onLayout={handleLayout}
      onContentSizeChange={handleContentSizeChange}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
