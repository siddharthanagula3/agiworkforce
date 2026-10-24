import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: mockBack,
    navigate: mockNavigate,
    replace: mockReplace,
    push: jest.fn(),
    canGoBack: mockCanGoBack,
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

const mockMemoryStore = {
  entries: [],
  filteredEntries: [],
  loading: false,
  error: null,
  searchQuery: '',
  fetchMemories: jest.fn(async () => undefined),
  addMemory: jest.fn(),
  updateMemory: jest.fn(),
  deleteMemory: jest.fn(),
  resetMemories: jest.fn(),
  togglePin: jest.fn(),
  setSearchQuery: jest.fn(),
  clearError: jest.fn(),
  resetVisibleState: jest.fn(),
};

jest.mock('@/src/features/memory/store', () => ({
  useMemoryStore: () => mockMemoryStore,
}));

import MemoryScreen from '../app/(app)/settings/memory';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

describe('Memory screen header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('returns to the page that opened it instead of replacing the stack with Settings', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<MemoryScreen />);

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to Settings only when nothing is behind it', () => {
    mockCanGoBack.mockReturnValue(false);
    render(<MemoryScreen />);

    fireEvent.press(screen.getByLabelText('Go back'));

    expect(mockNavigate).toHaveBeenCalledWith('/(app)/(tabs)/settings');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the title and the import action on the shared centred header', () => {
    mockCanGoBack.mockReturnValue(true);
    render(<MemoryScreen />);

    expect(screen.getByRole('header', { name: 'Memory' })).toBeTruthy();
    expect(screen.getByLabelText('Import memories')).toBeTruthy();
  });
});
