import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

interface KeyDownEvent {
  key: string;
  preventDefault: () => void;
}

interface KeyDownTarget {
  addEventListener: (type: 'keydown', listener: (event: KeyDownEvent) => void) => void;
  removeEventListener: (type: 'keydown', listener: (event: KeyDownEvent) => void) => void;
}

function keyDownTarget(): KeyDownTarget | null {
  if (Platform.OS !== 'web') return null;
  const host = globalThis as { document?: KeyDownTarget };
  return host.document ?? null;
}

/**
 * An open drawer answers back and Escape itself, ahead of the app-wide back
 * handler. Android delivers a hardware keyboard Escape as the back key, so one
 * subscription covers both there.
 */
export function useDrawerDismiss(isOpen: boolean, close: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    const target = keyDownTarget();
    if (!target) return () => subscription.remove();

    const onKeyDown = (event: KeyDownEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    target.addEventListener('keydown', onKeyDown);
    return () => {
      subscription.remove();
      target.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, close]);
}
