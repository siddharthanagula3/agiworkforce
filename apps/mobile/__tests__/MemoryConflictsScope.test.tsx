/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockList = jest.fn();
const mockRestore = jest.fn();
const mockFetchMemories = jest.fn();

jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('../src/features/chat/store/appModeStore', () => {
  const { create } = require('zustand');
  return {
    useChatAppModeStore: create((set: (value: unknown) => void) => ({
      appMode: 'cloud',
      setAppMode: (appMode: string) => set({ appMode }),
    })),
  };
});
jest.mock('../src/features/memory/store', () => ({
  useMemoryStore: (selector: (state: unknown) => unknown) =>
    selector({ fetchMemories: mockFetchMemories }),
}));
jest.mock('../src/features/memory/services/memoryConflicts', () => ({
  MEMORY_CONFLICT_RULE: 'rule',
  listMemoryConflicts: (...args: unknown[]) => mockList(...args),
  restoreReplacedMemory: (...args: unknown[]) => mockRestore(...args),
}));
jest.mock('../src/features/settings/Common', () => {
  const { View } = require('react-native');
  return {
    SettingsGroup: View,
    SettingsInfo: () => null,
    SettingsScreenShell: View,
  };
});
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#888888' }),
}));
jest.mock('../components/ui/LoadingIndicator', () => ({ LoadingIndicator: () => null }));
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }));
jest.mock('../components/ui/PressableBox', () => ({
  PressableBox: require('react-native').Pressable,
}));

import MemoryConflictsScreen from '../app/(app)/settings/memory-conflicts';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function conflict(id: string, replaced: string, kept: string) {
  return { id, replaced, kept };
}

function mode(appMode: 'local' | 'cloud') {
  act(() => useChatAppModeStore.getState().setAppMode(appMode));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchMemories.mockResolvedValue(undefined);
  act(() => useChatAppModeStore.getState().setAppMode('cloud'));
});

describe('MemoryConflictsScreen mode ownership', () => {
  it('keeps the local list when an older cloud list completes afterward', async () => {
    const cloud = deferred<ReturnType<typeof conflict>[]>();
    const local = deferred<ReturnType<typeof conflict>[]>();
    mockList.mockImplementation((scope: string) =>
      scope === 'cloud' ? cloud.promise : local.promise,
    );

    render(<MemoryConflictsScreen />);
    expect(mockList).toHaveBeenLastCalledWith('cloud');

    mode('local');
    expect(mockList).toHaveBeenLastCalledWith('local');

    await act(async () => {
      local.resolve([conflict('local-1', 'Local replaced', 'Local kept')]);
    });
    await act(async () => {
      cloud.resolve([conflict('cloud-1', 'Cloud replaced', 'Cloud kept')]);
    });

    expect(screen.getByText('Replaced: Local replaced')).toBeTruthy();
    expect(screen.queryByText('Replaced: Cloud replaced')).toBeNull();
  });

  it('drops an older cloud failure after the mode changed', async () => {
    const cloud = deferred<ReturnType<typeof conflict>[]>();
    mockList.mockImplementation((scope: string) =>
      scope === 'cloud' ? cloud.promise : Promise.resolve([conflict('l', 'Local replaced', 'k')]),
    );

    render(<MemoryConflictsScreen />);
    mode('local');
    await act(async () => {});
    await act(async () => {
      cloud.reject(new Error('cloud list failed'));
    });

    expect(screen.getByText('Replaced: Local replaced')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not refresh the new scope with a restore that finished in the old one', async () => {
    const restore = deferred<void>();
    mockList.mockImplementation((scope: string) =>
      Promise.resolve(
        scope === 'cloud'
          ? [conflict('cloud-1', 'Cloud replaced', 'Cloud kept')]
          : [conflict('local-1', 'Local replaced', 'Local kept')],
      ),
    );
    mockRestore.mockReturnValue(restore.promise);

    render(<MemoryConflictsScreen />);
    await act(async () => {});
    fireEvent.press(screen.getByLabelText('Use “Cloud replaced” instead'));
    expect(mockRestore).toHaveBeenCalledWith('cloud', 'cloud-1');

    mode('local');
    await act(async () => {});
    expect(screen.getByText('Replaced: Local replaced')).toBeTruthy();

    await act(async () => {
      restore.resolve();
    });

    expect(screen.getByText('Replaced: Local replaced')).toBeTruthy();
    expect(screen.queryByText('Replaced: Cloud replaced')).toBeNull();
    expect(screen.queryByText('Switching…')).toBeNull();
  });

  it('refreshes the list after a restore in the current scope', async () => {
    mockList
      .mockResolvedValueOnce([conflict('cloud-1', 'Cloud replaced', 'Cloud kept')])
      .mockResolvedValueOnce([]);
    mockRestore.mockResolvedValue(undefined);

    render(<MemoryConflictsScreen />);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Use “Cloud replaced” instead'));
    });

    expect(mockFetchMemories).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No memory has replaced another.')).toBeTruthy();
  });
});
