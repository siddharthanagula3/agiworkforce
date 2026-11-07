/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPreview = jest.fn();
const mockBulkInsert = jest.fn();
const mockPick = jest.fn();
const mockRead = jest.fn();
const mockGoBack = jest.fn();
let mockBlur: () => void = () => {};
let mockRefocus: () => void = () => {};

jest.mock('../lib/mmkv', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('../src/features/chat/store/appModeStore', () => {
  const { create } = require('zustand');
  return {
    useChatAppModeStore: create((set: (value: unknown) => void) => ({
      appMode: 'local',
      setAppMode: (appMode: string) => set({ appMode }),
    })),
  };
});
jest.mock('../src/features/memory/store', () => ({
  useMemoryStore: (selector: (state: unknown) => unknown) =>
    selector({ bulkInsert: mockBulkInsert }),
}));
jest.mock('../src/features/memory/services/memoryImport', () => ({
  ImportTextTooLargeError: class extends Error {},
  MAX_IMPORT_TEXT_CHARS: 100_000,
  MEMORY_IMPORT_SOURCES: ['ChatGPT', 'Other'],
  previewMemoryImport: (...args: unknown[]) => mockPreview(...args),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockPick(...args),
}));
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: (...args: unknown[]) => mockRead(...args),
  EncodingType: { UTF8: 'utf8' },
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => () => void) =>
    require('react').useEffect(() => {
      let cleanup = effect();
      mockBlur = () => cleanup();
      mockRefocus = () => {
        cleanup = effect();
      };
      return () => cleanup();
    }, [effect]),
}));
jest.mock('../src/shared/hooks/useGoBack', () => ({ useGoBack: () => mockGoBack }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  FadeIn: { duration: () => ({}) },
}));
jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#888888' }),
  motion: { moved: 0 },
}));
jest.mock('../components/ui/Text', () => ({ Text: require('react-native').Text }));
jest.mock('../components/ui/PressableBox', () => ({
  PressableBox: require('react-native').Pressable,
}));
jest.mock('../components/ui/Button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
      >
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
jest.mock('../src/i18n/plural', () => ({
  translatePlural: (
    _ns: string,
    _key: string,
    count: number,
    forms: { one: string; other: string },
  ) => (count === 1 ? forms.one : forms.other).replace('{{count}}', String(count)),
}));
jest.mock('../services/userMessage', () => ({
  toUserMessage: (_error: unknown, fallback: string) => fallback,
}));

import MemoryImportScreen from '../app/(app)/settings/memory-import';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { MEMORY_IMPORT_UNCERTAIN_MESSAGE } from '../src/features/memory/services/memoryImportOperation';

const PREVIEW = {
  sourceName: 'ChatGPT',
  items: [
    { content: 'Uses Vim', normalizedKey: 'uses vim', duplicate: false },
    { content: 'Likes tea', normalizedKey: 'likes tea', duplicate: false },
  ],
  itemsTruncated: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mode(appMode: 'local' | 'cloud') {
  act(() => useChatAppModeStore.getState().setAppMode(appMode));
}

async function previewDraft() {
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'Uses Vim\nLikes tea');
  await act(async () => {
    fireEvent.press(screen.getByText('Preview'));
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useChatAppModeStore.getState().setAppMode('local');
  mockPreview.mockResolvedValue(PREVIEW);
  mockBulkInsert.mockResolvedValue({ inserted: 1, skipped: 0 });
});

it('suspends a Local preview in Cloud without rebinding, retaining its selection on return', async () => {
  render(<MemoryImportScreen />);
  await previewDraft();
  fireEvent.press(screen.getByLabelText('Likes tea'));
  mode('cloud');
  expect(screen.queryByText('Uses Vim')).toBeNull();
  expect(screen.queryByText('Import 1 memory')).toBeNull();
  mode('local');
  await act(async () => {
    fireEvent.press(screen.getByText('Import 1 memory'));
  });
  expect(mockBulkInsert).toHaveBeenCalledWith(
    ['Uses Vim'],
    'ChatGPT',
    expect.objectContaining({
      scope: { scope: 'local' },
    }),
  );
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

it('clears ephemeral Cloud preview on logout even when the screen remains mounted', async () => {
  mode('cloud');
  render(<MemoryImportScreen />);
  await previewDraft();
  act(() => invalidateCloudAccount());
  mode('local');
  expect(screen.queryByText('Uses Vim')).toBeNull();
  expect(screen.getByLabelText('Memories to import').props.value).toBe('');
  expect(mockBulkInsert).not.toHaveBeenCalled();
  act(() => activateCloudAccount('account-a'));
  mode('cloud');
  expect(screen.getByLabelText('Memories to import').props.value).toBe('');
});

it('preserves device-owned typed text across Cloud login and logout', () => {
  render(<MemoryImportScreen />);
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'Device-only draft');
  mode('cloud');
  act(() => {
    invalidateCloudAccount();
    activateCloudAccount('account-b');
  });
  mode('local');
  expect(screen.getByLabelText('Memories to import').props.value).toBe('Device-only draft');
  expect(mockPreview).not.toHaveBeenCalled();
});

it('preserves same-owner Cloud preview across mode-only changes and owner refresh', async () => {
  mode('cloud');
  render(<MemoryImportScreen />);
  await previewDraft();
  act(() => activateCloudAccount('account-a'));
  mode('local');
  mode('cloud');
  expect(screen.getByText('Import 2 memories')).toBeTruthy();
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

it('does not let a late file read replace a newer draft after a mode round-trip', async () => {
  const read = deferred<string>();
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'fixture-only', size: 10 }] });
  mockRead.mockReturnValue(read.promise);
  render(<MemoryImportScreen />);
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'Original text');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Choose a text or JSON file'));
  });
  mode('cloud');
  mode('local');
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'Newer text');
  await act(async () => {
    read.resolve('Late file contents');
  });
  expect(screen.getByLabelText('Memories to import').props.value).toBe('Newer text');
});

it('does not read a selected file after navigation disposal', async () => {
  const pick = deferred<unknown>();
  mockPick.mockReturnValue(pick.promise);
  const view = render(<MemoryImportScreen />);
  fireEvent.press(screen.getByLabelText('Choose a text or JSON file'));
  view.unmount();
  await act(async () => {
    pick.resolve({ canceled: false, assets: [{ uri: 'fixture-only' }] });
  });
  expect(mockRead).not.toHaveBeenCalled();
});

it('does not publish an old preview or let its finally release a newer operation', async () => {
  const old = deferred<unknown>();
  const current = deferred<unknown>();
  mockPreview.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  render(<MemoryImportScreen />);
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'Old text');
  fireEvent.press(screen.getByText('Preview'));
  mode('cloud');
  mode('local');
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'New text');
  fireEvent.press(screen.getByText('Preview'));
  await act(async () => {
    old.resolve(PREVIEW);
  });
  expect(screen.queryByText('Import 2 memories')).toBeNull();
  expect(screen.getByLabelText('Memories to import').props.editable).toBe(false);
  await act(async () => {
    current.resolve(PREVIEW);
  });
  expect(screen.getByText('Import 2 memories')).toBeTruthy();
});

it('single-flights commit and retains uncertain outcome after a mode round-trip', async () => {
  const commit = deferred<unknown>();
  mockBulkInsert.mockReturnValue(commit.promise);
  render(<MemoryImportScreen />);
  await previewDraft();
  const button = screen.getByText('Import 2 memories');
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockBulkInsert).toHaveBeenCalledTimes(1);
  mode('cloud');
  mode('local');
  expect(screen.getByText(MEMORY_IMPORT_UNCERTAIN_MESSAGE)).toBeTruthy();
  await act(async () => {
    commit.resolve({ inserted: 2, skipped: 0 });
  });
  expect(screen.queryByText('Import complete')).toBeNull();
  fireEvent.press(screen.getByText('Import 2 memories'));
  expect(mockBulkInsert).toHaveBeenCalledTimes(1);
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

it('invalidates a pending commit on navigation blur without unmounting the draft', async () => {
  const commit = deferred<unknown>();
  mockBulkInsert.mockReturnValue(commit.promise);
  render(<MemoryImportScreen />);
  await previewDraft();
  fireEvent.press(screen.getByText('Import 2 memories'));
  const operation = mockBulkInsert.mock.calls[0]?.[2];
  expect(operation.isActive()).toBe(true);
  act(() => mockBlur());
  expect(operation.isActive()).toBe(false);
  act(() => mockRefocus());
  expect(screen.getByText('Uses Vim')).toBeTruthy();
  expect(screen.getByText(MEMORY_IMPORT_UNCERTAIN_MESSAGE)).toBeTruthy();
  await act(async () => {
    commit.resolve({ inserted: 2, skipped: 0 });
  });
  expect(screen.queryByText('Import complete')).toBeNull();
  fireEvent.press(screen.getByText('Import 2 memories'));
  expect(mockBulkInsert).toHaveBeenCalledTimes(1);
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

it('enables an empty Cloud import after account activation without a mode change', () => {
  invalidateCloudAccount();
  mode('cloud');
  render(<MemoryImportScreen />);
  expect(screen.getByLabelText('Memories to import').props.editable).toBe(false);
  act(() => activateCloudAccount('account-a'));
  expect(screen.getByLabelText('Memories to import').props.editable).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Memories to import'), 'New account draft');
  expect(screen.getByLabelText('Memories to import').props.value).toBe('New account draft');
  expect(mockPreview).not.toHaveBeenCalled();
});
