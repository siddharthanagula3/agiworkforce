import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import {
  chatRevealOffset,
  type Measurable,
} from '@/src/features/chat/components/cards/ChatScrollIntoView';

export const FIELD_BORDER_WIDTH = 1;

const FIELD_LINE_HEIGHT = Math.ceil(typeScale.body * 1.25);
const MULTILINE_FIELD_VISIBLE_LINES = 6.5;
const FIELD_VERTICAL_SPACE = 2 * (spacing.md + FIELD_BORDER_WIDTH);
const SINGLE_LINE_MIN_HEIGHT = 48;
const MULTILINE_MIN_HEIGHT = 100;

export function personalizationFieldHeight(
  fontScale: number,
  multiline: boolean,
  visibleInputHeight: number | null,
): { minHeight: number; maxHeight?: number } {
  const lineHeight = Math.ceil(FIELD_LINE_HEIGHT * fontScale);
  const singleLineHeight = Math.max(SINGLE_LINE_MIN_HEIGHT, lineHeight + FIELD_VERTICAL_SPACE);
  if (!multiline) return { minHeight: singleLineHeight };

  const preferredMaximum = Math.round(
    MULTILINE_FIELD_VISIBLE_LINES * lineHeight + FIELD_VERTICAL_SPACE,
  );
  // Keep a complete line editable even when the keyboard takes most of the screen.
  const maxHeight = Math.max(
    singleLineHeight,
    Math.min(preferredMaximum, visibleInputHeight ?? preferredMaximum),
  );
  const minHeight = Math.min(
    maxHeight,
    Math.max(MULTILINE_MIN_HEIGHT, 2 * lineHeight + FIELD_VERTICAL_SPACE),
  );
  return { minHeight, maxHeight };
}

const REVEAL_MARGIN = spacing.md;

const SCROLL_EVENT_THROTTLE = 16;

export interface FieldRevealFrame {
  blockY: number;
  blockHeight: number;
  inputBottom: number;
  viewportY: number;
  visibleBottom: number;
  currentOffset: number;
}

export function fieldRevealOffset(
  frame: FieldRevealFrame,
  margin: number = REVEAL_MARGIN,
): number | null {
  const viewportY = frame.viewportY + margin;
  const viewportHeight = frame.visibleBottom - margin - viewportY;
  if (viewportHeight <= 0) return null;
  const targetHeight =
    frame.blockHeight <= viewportHeight ? frame.blockHeight : frame.inputBottom - frame.blockY;
  const target = {
    targetY: frame.blockY,
    targetHeight,
    viewportY,
    viewportHeight,
    currentOffset: frame.currentOffset,
  };
  const toEnd = chatRevealOffset(target, 0, 'end');
  if (toEnd !== null) return toEnd;
  if (frame.blockY < viewportY && targetHeight <= viewportHeight) {
    return chatRevealOffset(target, 0, 'start');
  }
  return null;
}

export type MeasurableScrollView = ScrollView & Measurable;

export interface RevealScroller extends Measurable {
  scrollTo: (options: { y: number; animated?: boolean }) => void;
}

export interface FieldReveal {
  visibleInputHeight: number | null;
  focusField: (block: RefObject<Measurable | null>, input: RefObject<Measurable | null>) => void;
  blurField: (block: RefObject<Measurable | null>) => void;
}

interface FocusedField {
  block: RefObject<Measurable | null>;
  input: RefObject<Measurable | null>;
}

export function useFocusedFieldReveal(scrollRef: RefObject<RevealScroller | null>) {
  const [visibleInputHeight, setVisibleInputHeight] = useState<number | null>(null);
  const focused = useRef<FocusedField | null>(null);
  const scrollOffset = useRef(0);
  const keyboardTop = useRef<number | null | undefined>(undefined);
  const pendingFrame = useRef<number | null>(null);

  const cancelPendingFrame = useCallback(() => {
    if (pendingFrame.current !== null) {
      cancelAnimationFrame(pendingFrame.current);
      pendingFrame.current = null;
    }
  }, []);

  const currentKeyboardTop = useCallback((): number | null => {
    if (keyboardTop.current !== undefined) return keyboardTop.current;
    return Keyboard.isVisible() ? (Keyboard.metrics()?.screenY ?? null) : null;
  }, []);

  const revealFocused = useCallback(() => {
    const field = focused.current;
    const scroller = scrollRef.current;
    const block = field?.block.current;
    const input = field?.input.current;
    if (!field || !scroller || !block || !input) return;
    const top = currentKeyboardTop();
    if (top === null) return;
    block.measureInWindow((_x, blockY, _width, blockHeight) => {
      input.measureInWindow((_ix, inputY, _iwidth, inputHeight) => {
        scroller.measureInWindow((_sx, scrollY, _swidth, scrollHeight) => {
          if (focused.current !== field) return;
          const visibleBottom = Math.min(scrollY + scrollHeight, top);
          setVisibleInputHeight(Math.floor(visibleBottom - scrollY - 2 * REVEAL_MARGIN));
          const offset = fieldRevealOffset({
            blockY,
            blockHeight,
            inputBottom: inputY + inputHeight,
            viewportY: scrollY,
            visibleBottom,
            currentOffset: scrollOffset.current,
          });
          if (offset !== null) scroller.scrollTo({ y: offset, animated: true });
        });
      });
    });
  }, [scrollRef, currentKeyboardTop]);

  useEffect(() => {
    const shown = Platform.OS === 'ios' ? 'keyboardDidChangeFrame' : 'keyboardDidShow';
    const frameSubscription = Keyboard.addListener(shown, (event) => {
      const { screenY, height } = event.endCoordinates;
      const onScreen = height > 0 && screenY < Dimensions.get('window').height;
      keyboardTop.current = onScreen ? screenY : null;
      if (!onScreen) {
        setVisibleInputHeight(null);
        cancelPendingFrame();
      }
      if (!onScreen || !focused.current) return;
      cancelPendingFrame();
      // Android pads the screen in its own keyboardDidShow handler; measuring before that commit sees the unpadded list.
      pendingFrame.current = requestAnimationFrame(() => {
        pendingFrame.current = requestAnimationFrame(() => {
          pendingFrame.current = null;
          revealFocused();
        });
      });
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setVisibleInputHeight(null);
      cancelPendingFrame();
    });
    return () => {
      frameSubscription.remove();
      hideSubscription.remove();
      cancelPendingFrame();
    };
  }, [revealFocused, cancelPendingFrame]);

  const focusField = useCallback<FieldReveal['focusField']>(
    (block, input) => {
      focused.current = { block, input };
      revealFocused();
    },
    [revealFocused],
  );

  const blurField = useCallback<FieldReveal['blurField']>((block) => {
    if (focused.current?.block === block) focused.current = null;
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.y;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (focused.current) revealFocused();
  }, [revealFocused]);

  return {
    reveal: { visibleInputHeight, focusField, blurField } satisfies FieldReveal,
    scrollProps: { onScroll, onContentSizeChange, scrollEventThrottle: SCROLL_EVENT_THROTTLE },
  };
}
