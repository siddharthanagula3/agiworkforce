import { useEffect, useMemo } from 'react';
import { BackHandler } from 'react-native';

export const FULL_SCREEN_TOUCH_TARGET = 44;
const CHROME_HIT_SLOP = 8;

export type FullScreenChromeIntent = 'back' | 'close' | 'cancel';

export interface FullScreenControlProps {
  testID: string;
  onPress: () => void;
  accessibilityRole: 'button';
  accessibilityLabel: string;
  accessibilityHint?: string;
  hitSlop: number;
  style: { minWidth: number; minHeight: number };
}

export interface FullScreenChrome {
  back: FullScreenControlProps;
  close: FullScreenControlProps;
  cancel: FullScreenControlProps | null;
  /** What the system back gesture and Modal onRequestClose must run. */
  onRequestClose: () => void;
}

interface FullScreenIntentSpec {
  onPress: () => void;
  label: string;
  hint?: string;
}

export interface FullScreenChromeOptions {
  surface: string;
  back: FullScreenIntentSpec;
  close: FullScreenIntentSpec;
  cancel?: FullScreenIntentSpec;
  /**
   * Router screens: a Modal already routes Android back through
   * onRequestClose, a screen does not, so it asks for the same routing here.
   */
  interceptHardwareBack?: boolean;
}

function control(
  surface: string,
  intent: FullScreenChromeIntent,
  spec: FullScreenIntentSpec,
): FullScreenControlProps {
  return {
    testID: `${surface}.${intent}`,
    onPress: spec.onPress,
    accessibilityRole: 'button',
    accessibilityLabel: spec.label,
    ...(spec.hint ? { accessibilityHint: spec.hint } : {}),
    hitSlop: CHROME_HIT_SLOP,
    style: { minWidth: FULL_SCREEN_TOUCH_TARGET, minHeight: FULL_SCREEN_TOUCH_TARGET },
  };
}

/**
 * Every full-screen surface answers back, close and cancel. A surface may draw
 * one control for several intents, but the system back runs cancel before
 * close, so leaving a surface with unfinished work discards that work and not
 * the whole surface.
 */
export function useFullScreenChrome(options: FullScreenChromeOptions): FullScreenChrome {
  const { surface, back, close, cancel, interceptHardwareBack } = options;
  const chrome = useMemo(
    () => ({
      back: control(surface, 'back', back),
      close: control(surface, 'close', close),
      cancel: cancel ? control(surface, 'cancel', cancel) : null,
      onRequestClose: cancel ? cancel.onPress : close.onPress,
    }),
    [surface, back, close, cancel],
  );

  const { onRequestClose } = chrome;
  useEffect(() => {
    if (!interceptHardwareBack) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => subscription.remove();
  }, [interceptHardwareBack, onRequestClose]);

  return chrome;
}
