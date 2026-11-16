import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

export type BottomSheetPresenceHandlers = {
  onAnimate: (fromIndex: number, toIndex: number) => void;
  onChange: (index: number) => void;
  onClose: () => void;
};

/**
 * True from the moment an inline bottom sheet starts to open until it has fully
 * closed. onChange alone is not enough: it fires only when an animation ends on
 * a new index, so it misses the opening slide and a close that interrupts it.
 */
export function useBottomSheetPresence(): readonly [boolean, BottomSheetPresenceHandlers] {
  const [presented, setPresented] = useState(false);
  const handlers = useMemo<BottomSheetPresenceHandlers>(
    () => ({
      onAnimate: (_fromIndex, toIndex) => {
        if (toIndex >= 0) setPresented(true);
      },
      onChange: (index) => setPresented(index >= 0),
      onClose: () => setPresented(false),
    }),
    [],
  );
  return [presented, handlers] as const;
}

/**
 * An inline sheet answers the hardware back button while it is open, ahead of
 * the screen under it. BackHandler calls the newest listener first, so the
 * listener is registered once per opening and not again on every render, or a
 * sheet underneath would jump ahead of the one on top.
 */
export function useHardwareBackDismiss(open: boolean, dismiss: () => void): void {
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  });

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [open]);
}
