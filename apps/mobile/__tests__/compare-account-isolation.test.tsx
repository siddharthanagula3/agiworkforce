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
  useRouter: () => mockRouter,
}));

const mockStreamChat = jest.fn();
jest.mock('../services/streaming', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}));

jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: () => null,
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
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { StreamCallbacks } from '../services/streaming';

describe('CompareScreen Cloud account isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    // Compare is a Cloud-only surface (SIX-23): in Local Mode it renders the
    // boundary notice and no composer, so account-isolation behaviour is only
    // observable inside the Cloud boundary.
    useChatAppModeStore.setState({ appMode: 'cloud' });
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
});
