/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { TranslateOptions, TranslateResult } from '../services/translateService';

const mockTranslate = jest.fn();
const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn() };
let mockParams: { text?: string; targetLanguage?: string } = {};
let mockBlur: (() => void) | undefined;
let mockFocus: (() => void | (() => void)) | undefined;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactModule = require('react');
    ReactModule.useEffect(() => {
      mockFocus = callback;
      mockBlur = callback() || undefined;
      return () => mockBlur?.();
    }, [callback]);
  },
}));
jest.mock('../src/features/model-picker/localModelRuntime', () => ({
  resolveLocalModelRef: jest.fn(),
}));
jest.mock('../services/translateService', () => ({
  ...jest.requireActual('../services/translateService'),
  translate: (...args: unknown[]) => mockTranslate(...args),
  translateBackendLabel: () => 'Fixture backend',
}));
jest.mock('@agiworkforce/local-llm', () => ({
  getDefaultModel: () => ({ displayName: 'Fixture' }),
  localGenerate: jest.fn(),
}));
jest.mock('../src/ui/theme', () => ({ useThemeColors: () => ({}) }));
jest.mock('../src/ui/theme/tokens', () => ({ typeScale: {} }));
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }));
jest.mock('../components/ui/PressableBox', () => ({ PressableBox: require('react-native').Pressable }));
import TranslateScreen from '../app/(app)/translate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const result = (text: string): TranslateResult => ({ translatedText: text, sourceLanguage: 'en', targetLanguage: 'hi', backend: 'local_llm', pairCached: false });
const options = (index = 0): TranslateOptions => mockTranslate.mock.calls[index][3];
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; mockBlur = undefined; mockFocus = undefined; });

test('duplicate same-turn submit acquires one operation; edit retires old tokens and completion', async () => {
  const old = deferred<TranslateResult>();
  const next = deferred<TranslateResult>();
  mockTranslate.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'original');
  const submit = view.getByLabelText('Translate').props.onPress;
  act(() => { void submit(); void submit(); });
  expect(mockTranslate).toHaveBeenCalledTimes(1);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'edited');
  expect(options().signal?.aborted).toBe(true);
  fireEvent.press(view.getByLabelText('Translate'));
  act(() => { options().onToken?.('stale'); options(1).onToken?.('new token'); });
  await act(async () => { old.resolve(result('old result')); });
  expect(view.queryByText('old result')).toBeNull();
  expect(view.queryByText('stale')).toBeNull();
  expect(view.getByText('new token')).toBeTruthy();
  await act(async () => { next.resolve(result('new result')); });
  expect(view.getByText('new result')).toBeTruthy();
  expect(view.getByLabelText('Source text input').props.value).toBe('edited');
});

test('swap preserves typed source while pending and ignores late failure', async () => {
  const old = deferred<TranslateResult>();
  mockTranslate.mockReturnValueOnce(old.promise);
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'keep me');
  fireEvent.press(view.getByLabelText('Translate'));
  fireEvent.press(view.getByLabelText('Swap languages'));
  expect(view.getByLabelText('Source text input').props.value).toBe('keep me');
  expect(options().signal?.aborted).toBe(true);
  await act(async () => { old.reject(new Error('late')); });
  expect(view.queryByText(/Translation could not finish/)).toBeNull();
});

test('swap uses a current completed result', async () => {
  mockTranslate.mockResolvedValueOnce(result('completed'));
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'original');
  await act(async () => { fireEvent.press(view.getByLabelText('Translate')); });
  fireEvent.press(view.getByLabelText('Swap languages'));
  expect(view.getByLabelText('Source text input').props.value).toBe('completed');
});

test.each(['clear', 'back', 'blur', 'unmount'] as const)('%s retires publication without erasing unrelated input', async (action) => {
  const old = deferred<TranslateResult>();
  mockTranslate.mockReturnValueOnce(old.promise);
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'original');
  fireEvent.press(view.getByLabelText('Translate'));
  if (action === 'clear') fireEvent.press(view.getByLabelText('Clear text'));
  if (action === 'back') fireEvent.press(view.getByLabelText('Go back'));
  if (action === 'blur') act(() => { mockBlur?.(); });
  if (action === 'unmount') view.unmount();
  expect(options().signal?.aborted).toBe(true);
  await act(async () => { old.resolve(result('stale')); });
  if (action !== 'unmount') expect(view.queryByText('stale')).toBeNull();
  if (action === 'blur') {
    act(() => { mockBlur = mockFocus?.() || undefined; });
    expect(view.getByLabelText('Source text input').props.value).toBe('original');
    expect(view.getByLabelText('Translate').props.accessibilityState.disabled).toBe(false);
  }
});

test('late route prefill cannot replace manual text or clear intent', () => {
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'mine');
  mockParams = { text: 'late route', targetLanguage: 'French' };
  view.rerender(<TranslateScreen />);
  expect(view.getByLabelText('Source text input').props.value).toBe('mine');
  fireEvent.press(view.getByLabelText('Clear text'));
  mockParams = { text: 'later route' };
  view.rerender(<TranslateScreen />);
  expect(view.getByLabelText('Source text input').props.value).toBe('');
});

test('back synchronously rejects a captured same-turn submit before navigation cleanup', () => {
  const view = render(<TranslateScreen />);
  fireEvent.changeText(view.getByLabelText('Source text input'), 'original');
  const submit = view.getByLabelText('Translate').props.onPress;
  const back = view.getByLabelText('Go back').props.onPress;
  act(() => { back(); void submit(); });
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockTranslate).not.toHaveBeenCalled();
});
