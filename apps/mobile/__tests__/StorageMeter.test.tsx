import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const GIB = 1024 * 1024 * 1024;
const MODEL_BYTES = 2 * GIB;
const CACHE_BYTES = 512 * 1024 * 1024;

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getFreeDiskStorageAsync: jest.fn(),
  getTotalDiskCapacityAsync: jest.fn(),
}));

jest.mock('@/storage/installedModels', () => ({
  listInstalledModels: jest.fn(),
  deleteInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/modelDownload', () => ({
  modelRemovalUnsupportedReason: jest.fn(),
  MODEL_BUSY_REMOVAL_MESSAGE: 'busy',
  deleteDownloadedModel: jest.fn().mockResolvedValue(undefined),
  getModelStorageBytes: jest.fn(),
}));

jest.mock('@/services/dsarExport', () => ({
  exportAllUserData: jest.fn(),
  wipeAllLocalData: jest.fn(),
}));

jest.mock('@/src/features/settings/data-controls/localDataSnapshot', () => ({
  LocalExportAuthorityError: class LocalExportAuthorityError extends Error {},
  buildLocalDataExportSnapshot: jest.fn().mockReturnValue({}),
  resetLocalInMemoryState: jest.fn(),
}));

jest.mock('@/src/features/settings/storageUsage', () => ({
  getDirectorySizeBytes: jest.fn(),
}));

jest.mock('@/src/features/settings/StorageScopeNotice', () => ({
  StorageScopeNotice: () => null,
}));

import { getFreeDiskStorageAsync, getTotalDiskCapacityAsync } from 'expo-file-system/legacy';
import { listInstalledModels } from '@/storage/installedModels';
import { getModelStorageBytes } from '@/services/modelDownload';
import { getDirectorySizeBytes } from '@/src/features/settings/storageUsage';
import StorageManagerScreen from '@/app/(app)/settings/storage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  (listInstalledModels as jest.Mock).mockResolvedValue([]);
  (getModelStorageBytes as jest.Mock).mockResolvedValue(MODEL_BYTES);
  (getDirectorySizeBytes as jest.Mock).mockResolvedValue(CACHE_BYTES);
  (getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(12 * GIB);
  (getTotalDiskCapacityAsync as jest.Mock).mockResolvedValue(128 * GIB);
});

describe('the AGI storage meter at the top of Storage', () => {
  it('says how much of the phone AGI uses and draws that share as a bar', async () => {
    const screen = render(<StorageManagerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('storage-agi-summary')).toHaveTextContent(
        'AGI uses 2.5 GB of 128 GB on this phone',
      ),
    );
    const fill = StyleSheet.flatten(screen.getByTestId('storage-agi-meter-fill').props.style);
    expect(fill.width).toBe(`${((MODEL_BYTES + CACHE_BYTES) / (128 * GIB)) * 100}%`);
    expect(screen.getByTestId('storage-agi-meter').props.accessibilityLabel).toBe(
      'AGI uses 2.5 GB of 128 GB on this phone',
    );
  });

  it('shows the AGI total without a bar while only the capacity is still being read', async () => {
    const capacity = deferred<number>();
    (getTotalDiskCapacityAsync as jest.Mock).mockReturnValueOnce(capacity.promise);
    const screen = render(<StorageManagerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('storage-cache-bytes')).toHaveTextContent('512 MB'),
    );
    expect(screen.getByTestId('storage-agi-summary')).toHaveTextContent(
      'AGI uses 2.5 GB on this phone',
    );
    expect(screen.queryByTestId('storage-agi-meter')).toBeNull();

    await act(async () => {
      capacity.resolve(128 * GIB);
    });
    expect(screen.getByTestId('storage-agi-summary')).toHaveTextContent(
      'AGI uses 2.5 GB of 128 GB on this phone',
    );
    expect(screen.getByTestId('storage-agi-meter')).toBeTruthy();
    expect(screen.getByTestId('storage-agi-summary').props.accessible).toBe(false);
  });

  it('says Measuring until the models and cache are read', async () => {
    const modelBytes = deferred<number>();
    (getModelStorageBytes as jest.Mock).mockReturnValueOnce(modelBytes.promise);
    const screen = render(<StorageManagerScreen />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('storage-agi-summary')).toHaveTextContent('Measuring…');
    expect(screen.queryByTestId('storage-agi-meter')).toBeNull();

    await act(async () => {
      modelBytes.resolve(MODEL_BYTES);
    });
    await waitFor(() => expect(screen.getByTestId('storage-agi-meter')).toBeTruthy());
  });

  it('shows no total and no bar when a reading fails, and keeps one Try again', async () => {
    (getModelStorageBytes as jest.Mock).mockRejectedValueOnce(new Error('io'));
    const screen = render(<StorageManagerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('storage-model-bytes')).toHaveTextContent('Unavailable'),
    );
    expect(screen.getByTestId('storage-cache-bytes')).toHaveTextContent('512 MB');
    expect(screen.queryByTestId('storage-agi-summary')).toBeNull();
    expect(screen.queryByTestId('storage-agi-meter')).toBeNull();
    expect(screen.getAllByLabelText('Try reading storage again')).toHaveLength(1);
  });

  it('measures again after Try again and then shows the total', async () => {
    (getDirectorySizeBytes as jest.Mock).mockRejectedValueOnce(new Error('io'));
    const screen = render(<StorageManagerScreen />);
    await waitFor(() => expect(screen.getByLabelText('Try reading storage again')).toBeTruthy());
    expect(screen.queryByTestId('storage-agi-summary')).toBeNull();

    fireEvent.press(screen.getByLabelText('Try reading storage again'));

    await waitFor(() =>
      expect(screen.getByTestId('storage-agi-summary')).toHaveTextContent(
        'AGI uses 2.5 GB of 128 GB on this phone',
      ),
    );
  });

  it('states AGI storage without a bar when the phone capacity cannot be read', async () => {
    (getTotalDiskCapacityAsync as jest.Mock).mockRejectedValueOnce(new Error('unsupported'));
    const screen = render(<StorageManagerScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('storage-agi-summary')).toHaveTextContent(
        'AGI uses 2.5 GB on this phone',
      ),
    );
    expect(screen.queryByTestId('storage-agi-meter')).toBeNull();
  });
});
