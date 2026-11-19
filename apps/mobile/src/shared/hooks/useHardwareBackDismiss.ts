import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type RefObject,
} from 'react';
import { BackHandler, Platform } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';

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

type SystemScreenLaunch = () => void | Promise<void>;

type SystemScreenSheetOptions = {
  forwardedRef: ForwardedRef<BottomSheet>;
  sheetRef: RefObject<BottomSheet | null>;
  closeSheet: () => void;
  onUnmount: () => void;
};

export type SystemScreenSheet = {
  mounted: boolean;
  index: number;
  generation: number;
  launch: (run: SystemScreenLaunch) => void;
};

/**
 * Starting a system picker, the camera or a permission prompt pauses the
 * Android activity, and an inline sheet whose close animation was running then
 * stayed drawn with its scrim while its own state said closed, so X, the scrim
 * and Back did nothing. On Android the sheet is taken out of the tree instead,
 * the launch runs a frame after that commit, and the next opening through the
 * forwarded ref mounts a fresh sheet at its one content-sized detent. iOS
 * presents the system screen over the closing sheet and launches at once.
 */
export function useSystemScreenSheet({
  forwardedRef,
  sheetRef,
  closeSheet,
  onUnmount,
}: SystemScreenSheetOptions): SystemScreenSheet {
  const [placement, setPlacement] = useState({ mounted: true, index: -1, generation: 0 });
  const mountedRef = useRef(true);
  const pendingLaunch = useRef<{ run: SystemScreenLaunch } | null>(null);

  const mountOpen = useCallback((index: number) => {
    if (mountedRef.current || index < 0 || pendingLaunch.current) return;
    mountedRef.current = true;
    setPlacement((current) => ({ ...current, mounted: true, index }));
  }, []);

  useImperativeHandle(
    forwardedRef,
    (): BottomSheet => ({
      snapToIndex: (index, configs) => {
        if (mountedRef.current) sheetRef.current?.snapToIndex(index, configs);
        else mountOpen(index);
      },
      snapToPosition: (position, configs) => {
        if (mountedRef.current) sheetRef.current?.snapToPosition(position, configs);
        else mountOpen(0);
      },
      expand: (configs) => {
        if (mountedRef.current) sheetRef.current?.expand(configs);
        else mountOpen(0);
      },
      collapse: (configs) => {
        if (mountedRef.current) sheetRef.current?.collapse(configs);
        else mountOpen(0);
      },
      close: (configs) => sheetRef.current?.close(configs),
      forceClose: (configs) => sheetRef.current?.forceClose(configs),
    }),
    [mountOpen, sheetRef],
  );

  useEffect(() => {
    const pending = pendingLaunch.current;
    if (!pending) return undefined;
    const frame = requestAnimationFrame(() => {
      if (pendingLaunch.current !== pending) return;
      pendingLaunch.current = null;
      void pending.run();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (pendingLaunch.current === pending) pendingLaunch.current = null;
    };
  }, [placement.generation]);

  const launch = useCallback(
    (run: SystemScreenLaunch) => {
      if (pendingLaunch.current) return;
      if (Platform.OS !== 'android') {
        closeSheet();
        void run();
        return;
      }
      pendingLaunch.current = { run };
      mountedRef.current = false;
      onUnmount();
      setPlacement((current) => ({
        mounted: false,
        index: current.index,
        generation: current.generation + 1,
      }));
    },
    [closeSheet, onUnmount],
  );

  return { ...placement, launch };
}
