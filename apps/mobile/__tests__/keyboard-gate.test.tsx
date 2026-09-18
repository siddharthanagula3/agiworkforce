import { Keyboard, Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  keyboardAvoidingBehavior,
  useKeyboardSafeComposer,
} from '../src/features/chat/chrome/keyboardSafeComposer';

type KeyboardListener = () => void;

function emit(event: string): void {
  const add = Keyboard.addListener as unknown as jest.Mock;
  for (const call of add.mock.calls) {
    if (call[0] === event) (call[1] as KeyboardListener)();
  }
}

const originalOS = Platform.OS;

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(() => ({ remove: jest.fn() }) as never);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
});

describe('the composer keyboard contract', () => {
  it('pads on iOS for both a screen and a modal', () => {
    setPlatform('ios');
    expect(keyboardAvoidingBehavior('screen')).toBe('padding');
    expect(keyboardAvoidingBehavior('modal')).toBe('padding');
  });

  it('leaves an Android screen to adjustResize and handles an Android modal itself', () => {
    setPlatform('android');
    expect(keyboardAvoidingBehavior('screen')).toBeUndefined();
    expect(keyboardAvoidingBehavior('modal')).toBe('height');
  });

  it('never offsets the avoiding view, which would double-count the header', () => {
    setPlatform('ios');
    const { result } = renderHook(() => useKeyboardSafeComposer('screen'));
    expect(result.current.keyboardVerticalOffset).toBe(0);
  });
});

describe('keyboard open and close', () => {
  it('follows the iOS will-show and will-hide pair, which fire before the animation', () => {
    setPlatform('ios');
    const { result } = renderHook(() => useKeyboardSafeComposer('screen'));

    expect(result.current.keyboardVisible).toBe(false);
    act(() => emit('keyboardWillShow'));
    expect(result.current.keyboardVisible).toBe(true);
    act(() => emit('keyboardWillHide'));
    expect(result.current.keyboardVisible).toBe(false);
  });

  it('follows the Android did-show and did-hide pair, the only ones Android emits', () => {
    setPlatform('android');
    const { result } = renderHook(() => useKeyboardSafeComposer('screen'));

    act(() => emit('keyboardDidShow'));
    expect(result.current.keyboardVisible).toBe(true);
    act(() => emit('keyboardDidHide'));
    expect(result.current.keyboardVisible).toBe(false);
  });

  it('removes both listeners on unmount so a closed composer cannot set state', () => {
    setPlatform('ios');
    const remove = jest.fn();
    (Keyboard.addListener as unknown as jest.Mock).mockImplementation(() => ({ remove }) as never);

    const { unmount } = renderHook(() => useKeyboardSafeComposer('screen'));
    unmount();

    expect(remove).toHaveBeenCalledTimes(2);
  });
});
