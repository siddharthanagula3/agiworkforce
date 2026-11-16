import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { toolApprovalPolicyOption } from '@agiworkforce/types';

const mockPush = jest.fn();
const mockApproval: { ready: boolean; status: string; policy: string } = {
  ready: true,
  status: 'synced',
  policy: 'autonomous',
};
const mockStorage = new Map<string, string>();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: (name: string) => mockStorage.get(name) ?? null,
    setItem: (name: string, value: string) => {
      mockStorage.set(name, value);
    },
    removeItem: (name: string) => {
      mockStorage.delete(name);
    },
  },
}));

jest.mock('@/src/features/settings/tool-approvals/useToolApprovalPolicySync', () => ({
  useToolApprovalPolicySync: () => mockApproval,
}));

import {
  CODE_APPROVAL_NOTICE_TITLE,
  CodeApprovalNotice,
} from '@/src/features/cloud-code/components/CodeApprovalNotice';
import { useCodePreferences } from '@/src/features/settings/code/store';

async function hydrate() {
  await act(async () => {
    await useCodePreferences.persist.rehydrate();
  });
}

describe('CodeApprovalNotice', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockStorage.clear();
    mockApproval.ready = true;
    mockApproval.status = 'synced';
    mockApproval.policy = 'autonomous';
    useCodePreferences.setState({ approvalNoticeSeenAccounts: [] });
    await hydrate();
  });

  it('explains the account approval setting in one sentence', () => {
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    expect(screen.getByText(CODE_APPROVAL_NOTICE_TITLE)).toBeTruthy();
    expect(screen.getByText(toolApprovalPolicyOption('autonomous').hint)).toBeTruthy();
    expect(screen.getByLabelText('Got it')).toBeTruthy();
    expect(screen.getByLabelText('Learn more')).toBeTruthy();
  });

  it('describes whichever policy the account has', () => {
    mockApproval.policy = 'ask_every_time';
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    expect(screen.getByText(toolApprovalPolicyOption('ask_every_time').hint)).toBeTruthy();
  });

  it('closes on Got it and stays closed for that account after a restart', async () => {
    const first = render(<CodeApprovalNotice accountKey="account-a" />);

    fireEvent.press(first.getByLabelText('Got it'));

    expect(first.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    first.unmount();

    const saved = mockStorage.get('code-preferences') ?? '';
    expect(saved).toContain('account-a');
    useCodePreferences.setState({ approvalNoticeSeenAccounts: [] });
    mockStorage.set('code-preferences', saved);
    await hydrate();
    const second = render(<CodeApprovalNotice accountKey="account-a" />);
    expect(second.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
  });

  it('still shows to a second account on the same phone', () => {
    useCodePreferences.setState({ approvalNoticeSeenAccounts: ['account-a'] });

    const seen = render(<CodeApprovalNotice accountKey="account-a" />);
    expect(seen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();

    const other = render(<CodeApprovalNotice accountKey="account-b" />);
    expect(other.getByText(CODE_APPROVAL_NOTICE_TITLE)).toBeTruthy();
  });

  it('closes on Android back', () => {
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    expect(useCodePreferences.getState().approvalNoticeSeenAccounts).toEqual(['account-a']);
  });

  it('closes on a tap outside the card', () => {
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    fireEvent.press(screen.getByTestId('code-approval-notice-backdrop'));

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    expect(useCodePreferences.getState().approvalNoticeSeenAccounts).toEqual(['account-a']);
  });

  it('sets the flag, closes and opens the approval settings on Learn more', () => {
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    fireEvent.press(screen.getByLabelText('Learn more'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/auto-approve');
    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    expect(useCodePreferences.getState().approvalNoticeSeenAccounts).toEqual(['account-a']);
  });

  it('waits without marking the account while the policy has not loaded, then shows', () => {
    mockApproval.ready = false;
    mockApproval.status = 'loading';
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);
    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();

    mockApproval.ready = true;
    mockApproval.status = 'synced';
    screen.rerender(<CodeApprovalNotice accountKey="account-a" />);

    expect(screen.getByText(CODE_APPROVAL_NOTICE_TITLE)).toBeTruthy();
  });

  it('skips and keeps the account unmarked when the policy failed to load', () => {
    mockApproval.ready = false;
    mockApproval.status = 'error';
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    expect(useCodePreferences.getState().approvalNoticeSeenAccounts).toEqual([]);
  });

  it('never shows in Local mode', () => {
    mockApproval.ready = true;
    mockApproval.status = 'local';
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
  });
});
