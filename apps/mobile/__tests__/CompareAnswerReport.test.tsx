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

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() }),
}));

const mockStreamChat = jest.fn();
jest.mock('../services/streaming', () => ({
  streamChat: (...args: unknown[]) => mockStreamChat(...args),
}));

jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: () => null,
}));

const mockReportSheet = jest.fn();
jest.mock('../src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
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
        onPress: () => onSend('compare these two answers'),
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

function callbacksFor(index: number): StreamCallbacks {
  return mockStreamChat.mock.calls[index]?.[1] as StreamCallbacks;
}

describe('reporting a compare answer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'max' });
    useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
    mockStreamChat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      useAuthStore.setState({ clerkUserId: null, isClerkLoaded: false, isClerkSignedIn: false });
      invalidateCloudAccount();
    });
  });

  it('offers a report on each finished answer and names the slot and model it came from', () => {
    render(<CompareScreen />);
    expect(screen.queryByTestId('compare-report-A')).toBeNull();

    fireEvent.press(screen.getByLabelText('Send comparison prompt'));
    const a = callbacksFor(0);
    act(() => {
      a.onDelta({ content: 'the first answer' });
    });
    expect(screen.queryByTestId('compare-report-A')).toBeNull();

    act(() => {
      a.onDone();
    });
    expect(screen.queryByTestId('compare-report-B')).toBeNull();

    fireEvent.press(screen.getByTestId('compare-report-A'));

    const props = mockReportSheet.mock.calls[mockReportSheet.mock.calls.length - 1]?.[0] as {
      visible: boolean;
      title: string;
      target: {
        messageId: string;
        conversationId: string;
        contentExcerpt: string;
        subject: { kind: string; id: string };
      };
    };
    expect(props.visible).toBe(true);
    expect(props.title).toBe('Report this answer');
    expect(props.target.conversationId).toBe('compare');
    expect(props.target.contentExcerpt).toBe('the first answer');
    expect(props.target.subject.kind).toBe('compare-answer');
    expect(props.target.subject.id).toMatch(/^A:.+/);
    expect(props.target.messageId).toBe(`compare:${props.target.subject.id}`);
  });
});
