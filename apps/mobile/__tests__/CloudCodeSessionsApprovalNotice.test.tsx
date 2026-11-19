/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockApproval = { ready: true, status: 'synced', policy: 'autonomous' };
const mockAccess = { ready: true, accountKey: 'user-1' };
const mockFocus = { focused: true };

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    const focused = mockFocus.focused;
    React.useEffect(() => (focused ? callback() : undefined), [callback, focused]);
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
      <View style={style as never}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('../src/features/device-registry', () => ({
  listAccountComputers: () => new Promise(() => undefined),
}));

jest.mock('../src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
}));

jest.mock('../src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: mockAccess.ready,
    signedIn: true,
    accountKey: mockAccess.accountKey,
    activate: jest.fn(),
  }),
}));

jest.mock('../src/features/cloud-code/useCloudCodeSessions', () => ({
  useCloudCodeSessions: () => ({
    status: 'ready',
    sessions: [],
    availability: null,
    runtimes: [],
    error: null,
    refreshing: false,
    load: jest.fn(),
  }),
}));

jest.mock('../src/features/cloud-code/components/NewCloudCodeSessionSheet', () => ({
  NewCloudCodeSessionSheet: () => null,
}));

jest.mock('@/src/features/settings/tool-approvals/useToolApprovalPolicySync', () => ({
  useToolApprovalPolicySync: () => mockApproval,
}));

import { CloudCodeSessionsScreen } from '../src/features/cloud-code/CloudCodeSessionsScreen';
import { CODE_APPROVAL_NOTICE_TITLE } from '../src/features/cloud-code/components/CodeApprovalNotice';
import { useCodePreferences } from '../src/features/settings/code/store';

describe('AGI Code list approval notice', () => {
  beforeEach(async () => {
    mockAccess.ready = true;
    mockAccess.accountKey = 'user-1';
    mockFocus.focused = true;
    mockApproval.ready = true;
    mockApproval.status = 'synced';
    useCodePreferences.setState({ approvalNoticeSeenAccounts: [] });
    await act(async () => {
      await useCodePreferences.persist.rehydrate();
    });
  });

  it('shows the first time the list opens and not again once dismissed', () => {
    const first = render(<CloudCodeSessionsScreen />);
    expect(first.getByText(CODE_APPROVAL_NOTICE_TITLE)).toBeTruthy();

    fireEvent.press(first.getByLabelText('Got it'));
    expect(first.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    first.unmount();

    const second = render(<CloudCodeSessionsScreen />);
    expect(second.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
  });

  it('holds back while the new session sheet is open', () => {
    mockApproval.ready = false;
    mockApproval.status = 'loading';
    const screen = render(<CloudCodeSessionsScreen />);
    fireEvent.press(screen.getByTestId('cloud-code-new-session'));

    mockApproval.ready = true;
    mockApproval.status = 'synced';
    screen.rerender(<CloudCodeSessionsScreen />);

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
  });

  it('holds back while another screen is pushed over the list', () => {
    mockApproval.ready = false;
    mockApproval.status = 'loading';
    const screen = render(<CloudCodeSessionsScreen />);

    mockFocus.focused = false;
    mockApproval.ready = true;
    mockApproval.status = 'synced';
    screen.rerender(<CloudCodeSessionsScreen />);
    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();

    mockFocus.focused = true;
    screen.rerender(<CloudCodeSessionsScreen />);
    expect(screen.getByText(CODE_APPROVAL_NOTICE_TITLE)).toBeTruthy();
  });

  it('shows nothing before the account is signed in to Cloud', () => {
    mockAccess.ready = false;
    const screen = render(<CloudCodeSessionsScreen />);

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
  });
});
