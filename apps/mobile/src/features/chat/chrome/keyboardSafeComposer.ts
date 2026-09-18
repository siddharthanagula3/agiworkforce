import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export type ComposerSurfaceKind = 'screen' | 'modal';

export interface KeyboardSafeComposer {
  behavior: 'padding' | 'height' | undefined;
  keyboardVerticalOffset: number;
  keyboardVisible: boolean;
}

/**
 * Android's adjustResize already resizes a screen, so stacking a behavior on
 * top double-handles the keyboard. A Modal renders into its own native window
 * that adjustResize never reaches, so there the view has to do the work.
 */
export function keyboardAvoidingBehavior(
  kind: ComposerSurfaceKind,
): 'padding' | 'height' | undefined {
  if (Platform.OS === 'ios') return 'padding';
  return kind === 'modal' ? 'height' : undefined;
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return visible;
}

export function useKeyboardSafeComposer(
  kind: ComposerSurfaceKind = 'screen',
): KeyboardSafeComposer {
  const keyboardVisible = useKeyboardVisible();
  return {
    behavior: keyboardAvoidingBehavior(kind),
    keyboardVerticalOffset: 0,
    keyboardVisible,
  };
}
