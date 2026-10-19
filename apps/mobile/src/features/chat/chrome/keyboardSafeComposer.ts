import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export type ComposerSurfaceKind = 'screen' | 'modal';

export interface KeyboardSafeComposer {
  behavior: 'padding' | 'height';
  keyboardVerticalOffset: number;
  keyboardVisible: boolean;
}

/**
 * The Android build is edge-to-edge, so adjustResize never resizes the window
 * and a screen has to pad itself. A Modal renders into its own native window,
 * where shrinking the view's height is what keeps it on screen.
 */
export function keyboardAvoidingBehavior(kind: ComposerSurfaceKind): 'padding' | 'height' {
  if (Platform.OS === 'ios') return 'padding';
  return kind === 'modal' ? 'height' : 'padding';
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
