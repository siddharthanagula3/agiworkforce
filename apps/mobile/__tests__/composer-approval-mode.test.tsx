/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  DEFAULT_TOOL_APPROVAL_POLICY,
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
} from '@agiworkforce/types';

const mockFetchNamespace = jest.fn();
const mockSaveNamespace = jest.fn();
let mockAutonomyAllowed = true;

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/services/preferences', () => ({
  fetchToolApprovalNamespace: async (...args: unknown[]) => ({
    settings: await mockFetchNamespace(...args),
    autonomousToolApprovalsAllowed: mockAutonomyAllowed,
  }),
  savePreferenceNamespace: (...args: unknown[]) => mockSaveNamespace(...args),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { ComposerApprovalModeControl } from '../src/features/chat/components/ComposerApprovalModeControl';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

const OPTION = (policy: string) => TOOL_APPROVAL_POLICY_OPTIONS.find((o) => o.policy === policy)!;

describe('ComposerApprovalModeControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAutonomyAllowed = true;
    mockFetchNamespace.mockResolvedValue({ defaultPolicy: DEFAULT_TOOL_APPROVAL_POLICY });
    mockSaveNamespace.mockResolvedValue(undefined);
    useSettingsStore.setState({ toolApprovalPolicy: DEFAULT_TOOL_APPROVAL_POLICY });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true });
  });

  it('renders nothing outside signed-in cloud', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<ComposerApprovalModeControl />);

    expect(screen.queryByTestId('chat.approval-mode')).toBeNull();
  });

  it('lists the three policies with the account policy checked', async () => {
    mockFetchNamespace.mockResolvedValue({ defaultPolicy: 'auto_approve_read_only' });
    const screen = render(<ComposerApprovalModeControl />);
    await waitFor(() =>
      expect(screen.getByTestId('chat.approval-mode').props.accessibilityState.disabled).toBe(
        false,
      ),
    );

    fireEvent.press(screen.getByTestId('chat.approval-mode'));

    for (const option of TOOL_APPROVAL_POLICY_OPTIONS) {
      const row = screen.getByTestId(`chat.approval-mode.${option.policy}`);
      expect(row.props.accessibilityState.selected).toBe(
        option.policy === 'auto_approve_read_only',
      );
    }
  });

  it('writes the chosen policy to the account namespace', async () => {
    const screen = render(<ComposerApprovalModeControl />);
    await waitFor(() => expect(mockFetchNamespace).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('chat.approval-mode').props.accessibilityState.disabled).toBe(
        false,
      ),
    );

    fireEvent.press(screen.getByTestId('chat.approval-mode'));
    await act(async () => {
      fireEvent.press(screen.getByTestId(`chat.approval-mode.${OPTION('autonomous').policy}`));
    });

    expect(mockSaveNamespace).toHaveBeenCalledWith(TOOL_APPROVAL_PREFERENCE_NAMESPACE, {
      defaultPolicy: 'autonomous',
    });
    expect(useSettingsStore.getState().toolApprovalPolicy).toBe('autonomous');
  });

  it('restores the previous policy when the save fails', async () => {
    mockSaveNamespace.mockRejectedValue(new Error('down'));
    const screen = render(<ComposerApprovalModeControl />);
    await waitFor(() =>
      expect(screen.getByTestId('chat.approval-mode').props.accessibilityState.disabled).toBe(
        false,
      ),
    );

    fireEvent.press(screen.getByTestId('chat.approval-mode'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.approval-mode.auto_approve_read_only'));
    });

    await waitFor(() =>
      expect(useSettingsStore.getState().toolApprovalPolicy).toBe(DEFAULT_TOOL_APPROVAL_POLICY),
    );
  });

  it('hides the autonomous option and shows Ask when the workspace forbids it', async () => {
    mockAutonomyAllowed = false;
    mockFetchNamespace.mockResolvedValue({ defaultPolicy: 'autonomous' });
    const screen = render(<ComposerApprovalModeControl />);
    await waitFor(() =>
      expect(screen.getByTestId('chat.approval-mode').props.accessibilityState.disabled).toBe(
        false,
      ),
    );

    expect(screen.getByLabelText(`Tool approvals: ${OPTION('ask_every_time').label}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('chat.approval-mode'));

    expect(screen.queryByTestId('chat.approval-mode.autonomous')).toBeNull();
    expect(screen.getByTestId('chat.approval-mode.ask_every_time')).toBeTruthy();
  });

  it('stays hidden when the policy could not be loaded', async () => {
    mockFetchNamespace.mockRejectedValue(new Error('offline'));
    const screen = render(<ComposerApprovalModeControl />);

    await waitFor(() => expect(mockFetchNamespace).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('chat.approval-mode')).toBeNull());
  });
});
