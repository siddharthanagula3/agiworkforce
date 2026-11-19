import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn(),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: () =>
      JSON.stringify({ state: { approvalNoticeSeenAccounts: ['account-a'] }, version: 0 }),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/src/features/settings/tool-approvals/useToolApprovalPolicySync', () => ({
  useToolApprovalPolicySync: () => ({ ready: true, status: 'synced', policy: 'autonomous' }),
}));

import {
  CODE_APPROVAL_NOTICE_TITLE,
  CodeApprovalNotice,
} from '@/src/features/cloud-code/components/CodeApprovalNotice';
import { useCodePreferences } from '@/src/features/settings/code/store';

describe('CodeApprovalNotice before the saved flags are read', () => {
  it('stays hidden until they are read, so an account that has seen it never sees it flash', async () => {
    const screen = render(<CodeApprovalNotice accountKey="account-a" />);
    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    expect(useCodePreferences.persist.hasHydrated()).toBe(false);

    await act(async () => {
      await useCodePreferences.persist.rehydrate();
    });

    expect(screen.queryByText(CODE_APPROVAL_NOTICE_TITLE)).toBeNull();
    const other = render(<CodeApprovalNotice accountKey="account-b" />);
    expect(other.getByText(CODE_APPROVAL_NOTICE_TITLE)).toBeTruthy();
  });
});
