/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_POLICIES,
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
} from '@agiworkforce/types';

const mockFetchNamespace = jest.fn();
const mockSaveNamespace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchNamespace(...args),
  savePreferenceNamespace: (...args: unknown[]) => mockSaveNamespace(...args),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import AutoApproveScreen from '../app/(app)/settings/auto-approve';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

const READ_ONLY = TOOL_APPROVAL_POLICY_OPTIONS.find(
  (option) => option.policy === 'auto_approve_read_only',
)!;

function rowLabel(option: (typeof TOOL_APPROVAL_POLICY_OPTIONS)[number]): string {
  return `${option.label}. ${option.description.replace(/[.。]+$/, '')}`;
}

describe('Action approvals settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchNamespace.mockResolvedValue({ defaultPolicy: DEFAULT_TOOL_APPROVAL_POLICY });
    mockSaveNamespace.mockResolvedValue(undefined);
    useSettingsStore.setState({ toolApprovalPolicy: DEFAULT_TOOL_APPROVAL_POLICY });
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkSignedIn: false });
  });

  it('offers exactly the policies the server accepts', () => {
    const { getByLabelText, queryByText } = render(<AutoApproveScreen />);

    expect(TOOL_APPROVAL_POLICIES).toHaveLength(2);
    for (const option of TOOL_APPROVAL_POLICY_OPTIONS) {
      expect(getByLabelText(rowLabel(option))).toBeTruthy();
    }
    expect(queryByText('Approve all actions')).toBeNull();
  });

  it('stays selectable in Local mode without reaching the server', () => {
    const { getByLabelText } = render(<AutoApproveScreen />);

    fireEvent.press(getByLabelText(rowLabel(READ_ONLY)));

    expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only');
    expect(mockFetchNamespace).not.toHaveBeenCalled();
    expect(mockSaveNamespace).not.toHaveBeenCalled();
  });

  it('loads and writes the account default through the server preference namespace', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });
    mockFetchNamespace.mockResolvedValue({ defaultPolicy: 'auto_approve_read_only' });

    const screen = render(<AutoApproveScreen />);

    await waitFor(() =>
      expect(mockFetchNamespace).toHaveBeenCalledWith(TOOL_APPROVAL_PREFERENCE_NAMESPACE),
    );
    await waitFor(() =>
      expect(useSettingsStore.getState().toolApprovalPolicy).toBe('auto_approve_read_only'),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText(rowLabel(TOOL_APPROVAL_POLICY_OPTIONS[0])));
    });

    expect(mockSaveNamespace).toHaveBeenCalledWith(TOOL_APPROVAL_PREFERENCE_NAMESPACE, {
      defaultPolicy: 'ask_every_time',
    });
  });

  it('restores the previous policy and says so when the server rejects the write', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });
    mockSaveNamespace.mockRejectedValue(new Error('Preference service unavailable'));

    const screen = render(<AutoApproveScreen />);
    await waitFor(() => expect(mockFetchNamespace).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(screen.getByLabelText(rowLabel(READ_ONLY)));
    });

    await waitFor(() => expect(screen.getByText('Preference service unavailable')).toBeTruthy());
    expect(useSettingsStore.getState().toolApprovalPolicy).toBe(DEFAULT_TOOL_APPROVAL_POLICY);
  });
});
