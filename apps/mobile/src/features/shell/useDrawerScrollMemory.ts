import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

// Module scope, not a ref: a width change swaps the drawer between permanent
// and overlay, which remounts the content and would drop a ref-held offset.
let lastOffset = 0;

export interface DrawerScrollMemory {
  ref: RefObject<ScrollView | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export function resetDrawerScrollMemory(): void {
  lastOffset = 0;
}

export function useDrawerScrollMemory(isOpen: boolean): DrawerScrollMemory {
  const ref = useRef<ScrollView | null>(null);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastOffset = Math.max(0, event.nativeEvent.contentOffset.y);
  }, []);

  useEffect(() => {
    if (!isOpen || lastOffset <= 0) return;
    ref.current?.scrollTo({ y: lastOffset, animated: false });
  }, [isOpen]);

  return { ref, onScroll, scrollEventThrottle: 16 };
}
