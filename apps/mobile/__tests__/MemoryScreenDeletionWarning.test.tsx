import React from 'react';
import { AccessibilityInfo, Alert, Platform, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: jest.fn().mockResolvedValue({}),
  patchPreferenceNamespace: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/src/features/team/service', () => ({
  fetchWorkspaceOverview: jest.fn().mockResolvedValue({ workspaces: [] }),
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  markMemoryForSync: jest.fn(),
  syncNow: jest.fn().mockResolvedValue(undefined),
}));

const mockDeleteAll = jest.fn();
jest.mock('@/storage/memory', () => ({
  listMemoryFacts: jest.fn().mockResolvedValue([]),
  deleteAllMemoryFacts: (...args: unknown[]) => mockDeleteAll(...args),
  deleteMemoryFact: jest.fn().mockResolvedValue(undefined),
  updateMemoryFact: jest.fn().mockResolvedValue(undefined),
  togglePinMemoryFact: jest.fn().mockResolvedValue(undefined),
  searchMemoryByText: jest.fn().mockResolvedValue([]),
}));

import MemoryScreen from '../app/(app)/settings/memory';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useMemoryStore } from '../src/features/memory/store';

const WARNING = "Deletion didn't finish. Some memories may still be saved.";

describe('Memory screen deletion warning', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockDeleteAll.mockReset();
    useMemoryStore.getState().resetVisibleState();
    useChatAppModeStore.setState({ appMode: 'local' });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
    jest.useRealTimers();
  });

  async function confirmReset() {
    fireEvent.press(screen.getByText('Reset memory'));
    const buttons = alert.mock.calls[alert.mock.calls.length - 1][2] as AlertButton[];
    const confirm = buttons.find((button) => button.text === 'Reset memory');
    await act(async () => {
      await confirm?.onPress?.();
    });
  }

  it('shows no warning before anything fails', () => {
    render(<MemoryScreen />);

    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('keeps the warning after a failed reset, past the time the error banner used to clear', async () => {
    mockDeleteAll.mockRejectedValue(new Error('disk'));
    render(<MemoryScreen />);

    await confirmReset();
    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(screen.queryByText(/nothing was deleted/)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it('announces a failed reset to VoiceOver, which ignores live regions', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    const original = Platform.OS;
    Platform.OS = 'ios';
    mockDeleteAll.mockRejectedValue(new Error('disk'));
    render(<MemoryScreen />);

    await confirmReset();

    expect(announce).toHaveBeenCalledWith(WARNING);
    Platform.OS = original;
    announce.mockRestore();
  });

  it('does not announce on Android, where the live region speaks it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    const original = Platform.OS;
    Platform.OS = 'android';
    mockDeleteAll.mockRejectedValue(new Error('disk'));
    render(<MemoryScreen />);

    await confirmReset();

    expect(announce).not.toHaveBeenCalled();
    Platform.OS = original;
    announce.mockRestore();
  });

  it('goes away on Dismiss and comes back with the next failure', async () => {
    mockDeleteAll.mockRejectedValue(new Error('disk'));
    render(<MemoryScreen />);

    await confirmReset();
    fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText(WARNING)).toBeNull();

    await confirmReset();
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it('re-runs the reset through the same confirm on Try again and clears when it succeeds', async () => {
    mockDeleteAll.mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
    render(<MemoryScreen />);

    await confirmReset();
    expect(alert).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[1][0]).toBe('Reset memory?');

    const buttons = alert.mock.calls[1][2] as AlertButton[];
    await act(async () => {
      await buttons.find((button) => button.text === 'Reset memory')?.onPress?.();
    });
    expect(screen.queryByText(WARNING)).toBeNull();
    expect(mockDeleteAll).toHaveBeenCalledTimes(2);
  });

  it('leaves other memory errors on the banner that clears itself', async () => {
    render(<MemoryScreen />);

    await act(async () => {
      useMemoryStore.setState({ error: 'Could not delete this memory. Try again.' });
    });
    expect(screen.getByText('Could not delete this memory. Try again.')).toBeTruthy();
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});
