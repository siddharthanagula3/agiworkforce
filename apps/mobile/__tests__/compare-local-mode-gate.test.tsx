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
  push: jest.fn(),
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

let capturedOnSend: ((text: string) => boolean) | undefined;
jest.mock('../src/features/chat/components/ChatInput', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: MockPressable } = require('react-native') as typeof import('react-native');
  return {
    ChatInput: ({ onSend }: { onSend: (text: string) => boolean }) => {
      capturedOnSend = onSend;
      return ReactRuntime.createElement(MockPressable, {
        accessibilityRole: 'button',
        accessibilityLabel: 'Send comparison prompt',
        onPress: () => onSend('compare these two'),
      });
    },
  };
});

import CompareScreen from '../src/features/compare';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { EgressBlockedError } from '../lib/egressGuard';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { StreamCallbacks } from '../services/streaming';

const GUARD_MESSAGE_FRAGMENT = 'egressGuard refused';

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnSend = undefined;
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
  useWaitlistStore.setState({ cloudUnlocked: true });
  mockStreamChat.mockResolvedValue(undefined);
});

describe('CompareScreen in Local Mode', () => {
  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('renders the boundary notice instead of the comparison surface', () => {
    render(<CompareScreen />);

    expect(screen.getByTestId('cloud-sync-blocked-banner')).toBeTruthy();
    expect(screen.getByText(/Model comparison runs on AGI Cloud/)).toBeTruthy();
    expect(screen.queryByLabelText('Send comparison prompt')).toBeNull();
    expect(screen.queryByLabelText(/^Select model A/)).toBeNull();
  });

  it('offers a Switch to AGI Cloud action rather than transport text', () => {
    render(<CompareScreen />);

    expect(screen.queryByText(new RegExp(GUARD_MESSAGE_FRAGMENT))).toBeNull();
    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
  });

  it('routes a signed-out user to sign-in instead of flipping the boundary', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });
    render(<CompareScreen />);

    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/login');
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('refuses a forced send without starting any cloud stream', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const view = render(<CompareScreen />);
    const send = capturedOnSend;
    expect(send).toBeTruthy();
    mockStreamChat.mockClear();

    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
    });
    view.rerender(<CompareScreen />);

    let verdict: boolean | undefined;
    act(() => {
      verdict = send?.('compare these two');
    });
    expect(verdict).toBe(false);
    expect(mockStreamChat).not.toHaveBeenCalled();
  });
});

describe('CompareScreen egress refusal copy', () => {
  it('never renders the raw egressGuard message in a response pane', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const blocked = new EgressBlockedError('api.example-managed-cloud.test');
    expect(blocked.message).toContain(GUARD_MESSAGE_FRAGMENT);

    mockStreamChat.mockImplementation((_body: unknown, callbacks: StreamCallbacks) => {
      callbacks.onError(blocked);
      return Promise.resolve();
    });

    render(<CompareScreen />);
    fireEvent.press(screen.getByLabelText('Send comparison prompt'));

    expect(screen.queryByText(new RegExp(GUARD_MESSAGE_FRAGMENT))).toBeNull();
    expect(screen.getAllByText(/Model comparison runs on AGI Cloud/).length).toBeGreaterThan(0);
  });
});
