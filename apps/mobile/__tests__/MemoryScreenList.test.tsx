import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    push: mockPush,
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

const NOW = Date.now();
const TEAL = {
  id: 'memory-teal',
  fact: 'My favorite color is teal',
  category: 'preference',
  source: 'learned' as const,
  source_conversation_id: 'chat-7',
  source_conversation_title: 'Colours',
  pinned: false,
  created_at: NOW,
  updated_at: NOW,
};
const CITY = {
  id: 'memory-city',
  fact: 'Lives in Lisbon',
  category: 'fact',
  source: 'typed' as const,
  source_conversation_id: null,
  source_conversation_title: null,
  pinned: true,
  created_at: NOW,
  updated_at: NOW,
};

const mockMemoryStore = {
  entries: [TEAL, CITY],
  filteredEntries: [] as (typeof TEAL | typeof CITY)[],
  loading: false,
  error: null,
  searchQuery: '',
  fetchMemories: jest.fn(async () => undefined),
  addMemory: jest.fn(),
  updateMemory: jest.fn(),
  deleteMemory: jest.fn(async () => undefined),
  resetMemories: jest.fn(),
  togglePin: jest.fn(),
  setSearchQuery: jest.fn((query: string) => {
    mockMemoryStore.searchQuery = query;
    mockMemoryStore.filteredEntries = mockMemoryStore.entries.filter((entry) =>
      entry.fact.toLowerCase().includes(query.toLowerCase()),
    );
  }),
  clearError: jest.fn(),
  resetVisibleState: jest.fn(),
};

jest.mock('@/src/features/memory/store', () => ({
  useMemoryStore: () => mockMemoryStore,
}));

import MemoryScreen from '../app/(app)/settings/memory';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { describeMemoryDeletion } from '../src/features/memory/deleteConfirmation';

describe('Memory screen list', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMemoryStore.searchQuery = '';
    mockMemoryStore.filteredEntries = [];
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ memoryEnabled: true });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
  });

  it('scrolls the controls, search, filters and every stored memory as one list', () => {
    render(<MemoryScreen />);

    const list = within(screen.getByTestId('memory-list'));
    expect(list.getByText('Reset memory')).toBeTruthy();
    expect(list.getByPlaceholderText('Search memories...')).toBeTruthy();
    expect(list.getByLabelText('Pinned memories')).toBeTruthy();
    expect(list.getByText(TEAL.fact)).toBeTruthy();
    expect(list.getByText(CITY.fact)).toBeTruthy();
  });

  it('narrows the list by search and by the Pinned filter', () => {
    const { rerender } = render(<MemoryScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Search memories...'), 'lisbon');
    rerender(<MemoryScreen />);
    expect(screen.getByText(CITY.fact)).toBeTruthy();
    expect(screen.queryByText(TEAL.fact)).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear search'));
    rerender(<MemoryScreen />);
    fireEvent.press(screen.getByLabelText('Pinned memories'));
    expect(screen.getByText(CITY.fact)).toBeTruthy();
    expect(screen.queryByText(TEAL.fact)).toBeNull();
  });

  it('opens the chat a memory was learned from', () => {
    render(<MemoryScreen />);

    fireEvent.press(screen.getByLabelText('Learned from “Colours”. Open the chat'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/chat/chat-7');
  });

  it('deletes one memory from its row only after a confirmation that names it and says it cannot be restored', () => {
    render(<MemoryScreen />);

    expect(screen.getAllByLabelText(/^Memory: /)[0]!.props.accessibilityLabel).toBe(
      `Memory: ${TEAL.fact}`,
    );
    fireEvent.press(screen.getAllByLabelText('Delete memory')[0]!);

    expect(alert).toHaveBeenCalledWith(
      'Delete memory?',
      `This permanently deletes “${TEAL.fact}” from this device. It cannot be restored.`,
      expect.any(Array),
    );
    expect(mockMemoryStore.deleteMemory).not.toHaveBeenCalled();
    const buttons = alert.mock.lastCall?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Delete')?.onPress?.();
    expect(mockMemoryStore.deleteMemory).toHaveBeenCalledWith(TEAL.id);
  });

  it('names the memory being edited when its delete is confirmed from the editor', () => {
    render(<MemoryScreen />);

    fireEvent.press(screen.getAllByLabelText('Edit memory')[0]!);
    fireEvent.press(screen.getAllByLabelText('Delete memory').at(-1)!);

    expect(alert).toHaveBeenCalledWith(
      'Delete memory?',
      `This permanently deletes “${TEAL.fact}” from this device. It cannot be restored.`,
      expect.any(Array),
    );
  });

  it('says a Cloud memory leaves every synced device and shortens a long one', () => {
    expect(describeMemoryDeletion(`${'a'.repeat(90)}`, true)).toBe(
      `This permanently deletes “${'a'.repeat(80)}…” from your account and every synced device. It cannot be restored.`,
    );
  });
});
