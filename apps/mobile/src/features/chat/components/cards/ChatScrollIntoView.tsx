import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { Keyboard, type EmitterSubscription } from 'react-native';
import { spacing } from '@/src/ui/theme/tokens';

export interface Measurable {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

export interface ScrollableChatList {
  getAbsoluteLastScrollOffset: () => number;
  scrollToOffset: (params: {
    offset: number;
    animated?: boolean;
    skipFirstItemOffset?: boolean;
  }) => void;
}

export interface RevealFrame {
  targetY: number;
  targetHeight: number;
  viewportY: number;
  viewportHeight: number;
  currentOffset: number;
}

export type RevealEdge = 'start' | 'end';

export function chatRevealOffset(
  frame: RevealFrame,
  margin: number = spacing.lg,
  edge: RevealEdge = 'start',
): number | null {
  const { targetY, targetHeight, viewportY, viewportHeight, currentOffset } = frame;
  const above = targetY < viewportY;
  const below = targetY + targetHeight > viewportY + viewportHeight;
  if (!above && !below) return null;
  if (edge === 'end') {
    if (below) {
      return Math.max(
        0,
        currentOffset + targetY + targetHeight - viewportY - viewportHeight + margin,
      );
    }
    if (targetY + targetHeight > viewportY) return null;
  }
  return Math.max(0, currentOffset + targetY - viewportY - margin);
}

type Reveal = (target: Measurable, edge?: RevealEdge) => void;

const ChatScrollIntoViewContext = createContext<Reveal | null>(null);

export function ChatScrollIntoView({
  list,
  viewport,
  onReveal,
  children,
}: {
  list: RefObject<ScrollableChatList | null>;
  viewport: RefObject<Measurable | null>;
  onReveal?: () => void;
  children: ReactNode;
}) {
  const reveal = useCallback<Reveal>(
    (target, edge) => {
      const frame = viewport.current;
      if (!frame) return;
      target.measureInWindow((_x, targetY, _width, targetHeight) => {
        frame.measureInWindow((_vx, viewportY, _vwidth, viewportHeight) => {
          const scroller = list.current;
          if (!scroller) return;
          const offset = chatRevealOffset(
            {
              targetY,
              targetHeight,
              viewportY,
              viewportHeight,
              currentOffset: scroller.getAbsoluteLastScrollOffset(),
            },
            undefined,
            edge,
          );
          if (offset === null) return;
          onReveal?.();
          scroller.scrollToOffset({ offset, animated: true, skipFirstItemOffset: true });
        });
      });
    },
    [list, viewport, onReveal],
  );
  return (
    <ChatScrollIntoViewContext.Provider value={reveal}>
      {children}
    </ChatScrollIntoViewContext.Provider>
  );
}

export function ChatScrollIntoViewReset({ children }: { children: ReactNode }) {
  return (
    <ChatScrollIntoViewContext.Provider value={null}>{children}</ChatScrollIntoViewContext.Provider>
  );
}

export function useRevealInChat(): Reveal | null {
  return useContext(ChatScrollIntoViewContext);
}

export function useRevealFocusedField(
  containerRef: RefObject<Measurable | null>,
  edge: RevealEdge = 'start',
) {
  const reveal = useRevealInChat();
  const focused = useRef(false);
  const pendingShow = useRef<EmitterSubscription | null>(null);
  const pendingFrame = useRef<number | null>(null);

  const cancelPendingShow = useCallback(() => {
    pendingShow.current?.remove();
    pendingShow.current = null;
    if (pendingFrame.current !== null) {
      cancelAnimationFrame(pendingFrame.current);
      pendingFrame.current = null;
    }
  }, []);

  const revealContainer = useCallback(() => {
    const container = containerRef.current;
    if (container) reveal?.(container, edge);
  }, [containerRef, reveal, edge]);

  useEffect(() => cancelPendingShow, [cancelPendingShow]);

  const onFocus = useCallback(() => {
    focused.current = true;
    cancelPendingShow();
    if (!reveal) return;
    if (Keyboard.isVisible()) {
      revealContainer();
      return;
    }
    pendingShow.current = Keyboard.addListener('keyboardDidShow', () => {
      pendingShow.current?.remove();
      pendingShow.current = null;
      // Android pads the screen in its own keyboardDidShow handler; measuring before that commit sees the unpadded list.
      pendingFrame.current = requestAnimationFrame(() => {
        pendingFrame.current = requestAnimationFrame(() => {
          pendingFrame.current = null;
          if (focused.current) revealContainer();
        });
      });
    });
  }, [reveal, revealContainer, cancelPendingShow]);

  const onBlur = useCallback(() => {
    focused.current = false;
    cancelPendingShow();
  }, [cancelPendingShow]);

  const onContentSizeChange = useCallback(() => {
    if (focused.current && Keyboard.isVisible()) revealContainer();
  }, [revealContainer]);

  return { onFocus, onBlur, onContentSizeChange };
}
