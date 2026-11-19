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

jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: () => null,
}));

jest.mock('../src/features/chat/components/ChatInput', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native') as typeof import('react-native');
  const { Pressable: MockPressable, View: MockView } = RN;
  return {
    ChatInput: ({ onSend, onStop }: { onSend: (text: string) => boolean; onStop: () => void }) =>
      ReactRuntime.createElement(
        MockView,
        null,
        ReactRuntime.createElement(MockPressable, {
          accessibilityRole: 'button',
          accessibilityLabel: 'Send comparison prompt',
          onPress: () => onSend('compare these two answers'),
        }),
        ReactRuntime.createElement(MockPressable, {
          accessibilityRole: 'button',
          accessibilityLabel: 'Stop comparison',
          onPress: onStop,
        }),
      ),
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

function callbacksFor(index: number): StreamCallbacks {
  return mockStreamChat.mock.calls[index]?.[1] as StreamCallbacks;
}

function startComparison(): { a: StreamCallbacks; b: StreamCallbacks } {
  fireEvent.press(screen.getByLabelText('Send comparison prompt'));
  expect(mockStreamChat).toHaveBeenCalledTimes(2);
  return { a: callbacksFor(0), b: callbacksFor(1) };
}

describe('CompareScreen speed verdict', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('awards Faster when both answers complete with timings', () => {
    render(<CompareScreen />);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const { a, b } = startComparison();

    now.mockReturnValue(2_000);
    act(() => {
      a.onDelta({ content: 'first answer' });
      b.onDelta({ content: 'second answer' });
      a.onDone();
    });
    now.mockReturnValue(5_000);
    act(() => {
      b.onDone();
    });
    now.mockRestore();

    expect(screen.getAllByText('Faster')).toHaveLength(1);
  });

  it('gives no verdict when Stop interrupts both answers before either finishes', () => {
    render(<CompareScreen />);
    const { a } = startComparison();
    act(() => {
      a.onDelta({ content: 'partial text' });
    });

    fireEvent.press(screen.getByLabelText('Stop comparison'));

    expect(screen.queryByText('Faster')).toBeNull();
    expect(screen.queryByText('tie')).toBeNull();
    expect(screen.getByText('partial text')).toBeTruthy();
    expect(screen.getAllByText('Stopped before this answer finished.')).toHaveLength(2);
  });

  it('gives no verdict when one answer completed and the other was stopped', () => {
    render(<CompareScreen />);
    const { a } = startComparison();
    act(() => {
      a.onDelta({ content: 'finished text' });
      a.onDone();
    });

    fireEvent.press(screen.getByLabelText('Stop comparison'));

    expect(screen.queryByText('Faster')).toBeNull();
    expect(screen.queryByText('tie')).toBeNull();
    expect(screen.getAllByText('Stopped before this answer finished.')).toHaveLength(1);
  });

  it('gives no verdict when one answer failed and the other was stopped', () => {
    render(<CompareScreen />);
    const { a } = startComparison();
    act(() => {
      a.onError(new Error('provider unavailable'));
    });

    fireEvent.press(screen.getByLabelText('Stop comparison'));

    expect(screen.queryByText('Faster')).toBeNull();
    expect(screen.queryByText('tie')).toBeNull();
  });

  it('gives no verdict when one answer failed and the other completed', () => {
    render(<CompareScreen />);
    const { a, b } = startComparison();
    act(() => {
      a.onError(new Error('provider unavailable'));
      b.onDelta({ content: 'only answer' });
      b.onDone();
    });

    expect(screen.queryByText('Faster')).toBeNull();
    expect(screen.queryByText('tie')).toBeNull();
  });

  it('gives no verdict when both answers fail', () => {
    render(<CompareScreen />);
    const { a, b } = startComparison();
    act(() => {
      a.onError(new Error('first failed'));
      b.onError(new Error('second failed'));
    });

    expect(screen.queryByText('Faster')).toBeNull();
    expect(screen.queryByText('tie')).toBeNull();
  });

  it('promises simultaneous answers only on a plan that runs them together', () => {
    const { unmount } = render(<CompareScreen />);
    expect(screen.getByText(/to both models simultaneously/)).toBeTruthy();
    unmount();

    act(() => {
      useTierStore.setState({ tier: 'basic' });
    });
    render(<CompareScreen />);

    expect(screen.queryByText(/simultaneously/)).toBeNull();
    expect(screen.getByText(/Your plan runs one answer at a time/)).toBeTruthy();
  });

  it('reports a tie only for two completed answers with equal durations', () => {
    render(<CompareScreen />);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000);
    const { a, b } = startComparison();
    act(() => {
      a.onDelta({ content: 'first answer' });
      b.onDelta({ content: 'second answer' });
      a.onDone();
      b.onDone();
    });
    now.mockRestore();

    expect(screen.queryByText('Faster')).toBeNull();
    expect(screen.getAllByText('tie')).toHaveLength(2);
  });
});
