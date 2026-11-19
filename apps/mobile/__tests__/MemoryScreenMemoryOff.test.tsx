import React from 'react';
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

const mockPatchPreferences = jest.fn().mockResolvedValue({});
jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: jest.fn().mockResolvedValue({}),
  patchPreferenceNamespace: (...args: unknown[]) => mockPatchPreferences(...args),
}));

jest.mock('@/src/features/team/service', () => ({
  fetchWorkspaceOverview: jest.fn().mockResolvedValue({ workspaces: [] }),
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  markMemoryForSync: jest.fn(),
  syncNow: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/storage/memory', () => ({
  listMemoryFacts: jest.fn().mockResolvedValue([]),
  deleteAllMemoryFacts: jest.fn().mockResolvedValue(undefined),
  deleteMemoryFact: jest.fn().mockResolvedValue(undefined),
  updateMemoryFact: jest.fn().mockResolvedValue(undefined),
  togglePinMemoryFact: jest.fn().mockResolvedValue(undefined),
  searchMemoryByText: jest.fn().mockResolvedValue([]),
}));

import MemoryScreen from '../app/(app)/settings/memory';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useMemoryStore } from '../src/features/memory/store';
import { useCloudMemoryStore } from '../stores/memory/cloudMemoryStore';
import { useMemorySyncStateStore } from '../stores/memory/memorySyncStateStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const T = '2026-11-15T07:00:00.000Z';

function seedCloudMemory(id: string, content: string) {
  useCloudMemoryStore.getState().upsertCloudMemory({
    id,
    content,
    category: null,
    source: 'mobile',
    pinned: false,
    isDeleted: false,
    createdAt: T,
    updatedAt: T,
  });
}

describe('Memory screen while Memory is off', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('memory-screen-user');
    useCloudMemoryStore.getState().clearCloudMemoryData();
    useMemorySyncStateStore.getState().resetMemorySync();
    useMemoryStore.getState().resetVisibleState();
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('does not offer Add or Import while Cloud memory is off and offers a way to turn it on', async () => {
    useCloudSettingsStore.setState({ memoryEnabled: false });
    render(<MemoryScreen />);

    expect(screen.queryByLabelText('Add memory')).toBeNull();
    expect(screen.queryByLabelText('Import memories')).toBeNull();
    expect(
      screen.getByText("Memory is off, so new memories can't be added or imported."),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Turn on Memory'));
    });

    expect(mockPatchPreferences).toHaveBeenCalledWith('capabilities', { memory: true });
    expect(screen.getByLabelText('Add memory')).toBeTruthy();
    expect(screen.getByLabelText('Import memories')).toBeTruthy();
    expect(screen.queryByLabelText('Turn on Memory')).toBeNull();
  });

  it('accepts a new memory right after Memory is turned on for an account that had it off', async () => {
    useMemorySyncStateStore.getState().setAccountMemoryEnabled(false);
    useCloudSettingsStore.setState({ memoryEnabled: false });
    render(<MemoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Turn on Memory'));
    });
    expect(useMemorySyncStateStore.getState().accountMemoryEnabled).toBe(true);

    let result: string | null = 'not run';
    await act(async () => {
      result = await useMemoryStore.getState().addMemory('Prefers metric units');
    });

    expect(result).toBeNull();
    expect(screen.getAllByText('Prefers metric units')).toHaveLength(1);
    expect(screen.queryByText('Memory is off. Turn on Memory to add memories.')).toBeNull();
  });

  it('keeps the account switch as it was when turning Memory on is not saved', async () => {
    useMemorySyncStateStore.getState().setAccountMemoryEnabled(false);
    useCloudSettingsStore.setState({ memoryEnabled: false });
    mockPatchPreferences.mockRejectedValueOnce(new Error('offline'));
    render(<MemoryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Turn on Memory'));
    });

    expect(useMemorySyncStateStore.getState().accountMemoryEnabled).toBe(false);
    expect(useCloudSettingsStore.getState().memoryEnabled).toBe(false);
  });

  it('lists a memory added with the screen open once', async () => {
    useCloudSettingsStore.setState({ memoryEnabled: true });
    render(<MemoryScreen />);
    expect(await screen.findByText('0 memories')).toBeTruthy();

    await act(async () => {
      await useMemoryStore.getState().addMemory('Likes zebra stripes');
    });

    expect(screen.getAllByText('Likes zebra stripes')).toHaveLength(1);
    expect(screen.getByText('1 memory')).toBeTruthy();
    expect(useMemoryStore.getState().entries).toHaveLength(1);
  });

  it('does not offer Add while device memory is off either', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ memoryEnabled: false });
    render(<MemoryScreen />);

    expect(screen.queryByLabelText('Add memory')).toBeNull();
    expect(screen.getByLabelText('Turn on Memory')).toBeTruthy();
  });

  it('removes an entry from the list when the Cloud store drops it after a server refusal', async () => {
    useCloudSettingsStore.setState({ memoryEnabled: true });
    seedCloudMemory('memory-zebra', 'Likes zebra stripes');
    render(<MemoryScreen />);
    expect(await screen.findByText('Likes zebra stripes')).toBeTruthy();

    act(() => {
      useCloudMemoryStore.getState().hardDeleteCloudMemory('memory-zebra');
    });

    expect(screen.queryByText('Likes zebra stripes')).toBeNull();
    expect(screen.getByText('0 memories')).toBeTruthy();
  });
});
