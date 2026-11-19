import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
};
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => mockRouter,
}));

const mockStreamChat = jest.fn();
jest.mock('../services/streaming', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}));

const mockSelectModels: Array<(id: string) => void> = [];
const mockSheetShowSpeed: Array<boolean | undefined> = [];
jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: ({
    onSelect,
    showSpeed,
  }: {
    onSelect: (id: string) => void;
    showSpeed?: boolean;
  }) => {
    mockSelectModels.push(onSelect);
    mockSheetShowSpeed.push(showSpeed);
    return null;
  },
}));

jest.mock('../src/features/chat/components/ChatInput', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: MockPressable } = require('react-native') as typeof import('react-native');
  return {
    ChatInput: ({ onSend }: { onSend: (text: string) => boolean }) =>
      ReactRuntime.createElement(MockPressable, {
        accessibilityRole: 'button',
        accessibilityLabel: 'Send comparison prompt',
        onPress: () => onSend('account A private comparison'),
      }),
  };
});

import CompareScreen from '../src/features/compare';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { StreamCallbacks } from '../services/streaming';
import { getCloudModelsForTier } from '../lib/models';
import { getRoutingSlotModel, resolveModelFamilySlot } from '@agiworkforce/types';

const FAST_OPENAI = resolveModelFamilySlot('openai/gpt-fast');
const FAST_ANTHROPIC = getRoutingSlotModel('fast_anthropic');

describe('CompareScreen Cloud account isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectModels.length = 0;
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max' });
    useAuthStore.setState({
      clerkUserId: 'account-a',
      isClerkLoaded: true,
      isClerkSignedIn: true,
    });
    mockStreamChat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      useAuthStore.setState({
        clerkUserId: null,
        isClerkLoaded: false,
        isClerkSignedIn: false,
      });
      invalidateCloudAccount();
    });
  });

  it('opts both compared answers out of the picker fast speed, like web compare', () => {
    mockSheetShowSpeed.length = 0;
    render(<CompareScreen />);

    expect(mockSheetShowSpeed.length).toBeGreaterThan(0);
    expect(mockSheetShowSpeed.every((showSpeed) => showSpeed === false)).toBe(true);

    fireEvent.press(screen.getByLabelText('Send comparison prompt'));

    expect(mockStreamChat).toHaveBeenCalledTimes(2);
    for (const call of mockStreamChat.mock.calls) {
      expect((call[0] as { speed?: string }).speed).toBeUndefined();
      expect(call[3]).toEqual({ ignorePickerSpeed: true });
    }
  });

  it('clears account-A results before paint and ignores its buffered callbacks after account B activates', () => {
    render(<CompareScreen />);

    fireEvent.press(screen.getByLabelText('Send comparison prompt'));
    expect(mockStreamChat).toHaveBeenCalledTimes(2);

    const callbacksA = mockStreamChat.mock.calls[0]?.[1] as StreamCallbacks;
    const callbacksB = mockStreamChat.mock.calls[1]?.[1] as StreamCallbacks;
    const signalA = mockStreamChat.mock.calls[0]?.[2] as AbortSignal;
    const signalB = mockStreamChat.mock.calls[1]?.[2] as AbortSignal;

    act(() => {
      callbacksA.onDelta({ content: 'account-a-private-result' });
      callbacksB.onDelta({ content: 'account-a-second-private-result' });
    });
    expect(screen.getByText('account-a-private-result')).toBeTruthy();

    act(() => {
      activateCloudAccount('account-b');
      useAuthStore.setState({ clerkUserId: 'account-b' });
    });

    expect(signalA.aborted).toBe(true);
    expect(signalB.aborted).toBe(true);
    expect(screen.queryByText('account-a-private-result')).toBeNull();
    expect(screen.queryByText('account-a-second-private-result')).toBeNull();

    act(() => {
      callbacksA.onDelta({ content: 'buffered-account-a-data' });
      callbacksA.onDone();
      callbacksB.onError(new Error('account-a-private-error'));
    });
    expect(screen.queryByText('buffered-account-a-data')).toBeNull();
    expect(screen.queryByText('account-a-private-error')).toBeNull();
  });

  it('does not start comparison streams without an active Cloud owner', () => {
    invalidateCloudAccount();
    useAuthStore.setState({ clerkUserId: null, isClerkSignedIn: false });
    render(<CompareScreen />);

    fireEvent.press(screen.getByLabelText('Send comparison prompt'));

    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(screen.getAllByText('Sign in to use AGI Cloud model comparison.')).toHaveLength(2);
  });

  it('cancels both responses when a model changes so old text cannot be relabeled', () => {
    render(<CompareScreen />);
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));

    const callbacksA = mockStreamChat.mock.calls[0]?.[1] as StreamCallbacks;
    const signalA = mockStreamChat.mock.calls[0]?.[2] as AbortSignal;
    const signalB = mockStreamChat.mock.calls[1]?.[2] as AbortSignal;
    const otherModel = (mockStreamChat.mock.calls[1]?.[0] as { model: string }).model;

    act(() => callbacksA.onDelta({ content: 'old-model-output' }));
    expect(screen.getByText('old-model-output')).toBeTruthy();

    act(() => mockSelectModels[0]?.(otherModel));

    expect(signalA.aborted).toBe(true);
    expect(signalB.aborted).toBe(true);
    expect(screen.queryByText('old-model-output')).toBeNull();
    act(() => callbacksA.onDelta({ content: 'late-old-model-output' }));
    expect(screen.queryByText('late-old-model-output')).toBeNull();
  });

  it('does not offer or send a two-model comparison when the current plan has fewer than two models', () => {
    expect(getCloudModelsForTier('local-only').length).toBeLessThan(2);
    useTierStore.setState({ tier: 'local-only' });
    render(<CompareScreen />);

    expect(screen.getByText(/fewer than two models available/)).toBeTruthy();
    expect(screen.queryByLabelText('Send comparison prompt')).toBeNull();
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  it('starts a comparison using two distinct models available to the current paid plan', () => {
    useTierStore.setState({ tier: 'pro' });
    render(<CompareScreen />);
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));

    const selected = mockStreamChat.mock.calls.map((call) => (call[0] as { model: string }).model);
    const eligible = getCloudModelsForTier('pro').map((model) => model.id);
    expect(selected).toHaveLength(2);
    expect(selected[0]).not.toBe(selected[1]);
    expect(selected.every((id) => eligible.includes(id))).toBe(true);
  });

  it('compares the fast OpenAI model with the fast Anthropic model on the Free plan, one answer at a time', () => {
    useTierStore.setState({ tier: 'free' });
    render(<CompareScreen />);
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));

    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    const callbacksA = mockStreamChat.mock.calls[0]?.[1] as StreamCallbacks;
    act(() => callbacksA.onDone());
    expect(mockStreamChat).toHaveBeenCalledTimes(2);

    const selected = mockStreamChat.mock.calls.map((call) => (call[0] as { model: string }).model);
    expect([...selected].sort()).toEqual([FAST_OPENAI, FAST_ANTHROPIC].sort());
  });

  it('aborts a paid comparison when the account loses access to its selected models', () => {
    render(<CompareScreen />);
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));
    const callbacksA = mockStreamChat.mock.calls[0]?.[1] as StreamCallbacks;
    const signalA = mockStreamChat.mock.calls[0]?.[2] as AbortSignal;
    const signalB = mockStreamChat.mock.calls[1]?.[2] as AbortSignal;
    const paidSelection = mockStreamChat.mock.calls.map(
      (call) => (call[0] as { model: string }).model,
    );
    const freeIds = getCloudModelsForTier('free').map((model) => model.id);
    expect(paidSelection.some((id) => !freeIds.includes(id))).toBe(true);

    act(() => callbacksA.onDelta({ content: 'paid-only-output' }));
    act(() => useTierStore.setState({ tier: 'free' }));

    expect(signalA.aborted).toBe(true);
    expect(signalB.aborted).toBe(true);
    expect(screen.queryByText('paid-only-output')).toBeNull();

    mockStreamChat.mockClear();
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));
    const nextModel = (mockStreamChat.mock.calls[0]?.[0] as { model: string }).model;
    expect(freeIds).toContain(nextModel);
  });

  it('aborts a comparison and stops offering one when the plan drops below two models', () => {
    render(<CompareScreen />);
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));
    const signalA = mockStreamChat.mock.calls[0]?.[2] as AbortSignal;
    const signalB = mockStreamChat.mock.calls[1]?.[2] as AbortSignal;

    act(() => useTierStore.setState({ tier: 'local-only' }));

    expect(signalA.aborted).toBe(true);
    expect(signalB.aborted).toBe(true);
    expect(screen.queryByLabelText('Send comparison prompt')).toBeNull();
  });
});
