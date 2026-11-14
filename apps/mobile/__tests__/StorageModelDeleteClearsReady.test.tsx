import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';

const INSTALLED = {
  id: 'local-fixture',
  display_name: 'Fixture Local',
  runtime: 'local',
  format: 'gguf',
  size_bytes: 2_000_000_000,
  sha256: null,
  local_path: 'file:///documents/models/local-fixture/model.gguf',
  installed_at: 0,
  last_used_at: null,
  capabilities: null,
};

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
  getFreeDiskStorageAsync: jest.fn().mockResolvedValue(12 * 1024 * 1024 * 1024),
}));

jest.mock('@/storage/installedModels', () => ({
  listInstalledModels: jest.fn(),
  deleteInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/modelDownload', () => ({
  modelRemovalUnsupportedReason: jest.requireActual('@/services/modelDownload')
    .modelRemovalUnsupportedReason,
  MODEL_BUSY_REMOVAL_MESSAGE: jest.requireActual('@/services/modelDownload')
    .MODEL_BUSY_REMOVAL_MESSAGE,
  deleteDownloadedModel: jest.fn().mockResolvedValue(undefined),
  getModelStorageBytes: jest.fn().mockResolvedValue(2_000_000_000),
  downloadModel: jest.fn(),
  cancelDownload: jest.fn(),
  assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
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
  getDirectorySizeBytes: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/src/features/settings/StorageScopeNotice', () => ({
  StorageScopeNotice: () => null,
}));

import { listInstalledModels, deleteInstalledModel } from '@/storage/installedModels';
import { deleteDownloadedModel, getModelStorageBytes } from '@/services/modelDownload';
import { wipeAllLocalData } from '@/services/dsarExport';
import { getDirectorySizeBytes } from '@/src/features/settings/storageUsage';
import StorageManagerScreen from '@/app/(app)/settings/storage';

function pressDestructiveAlertButton() {
  const alertSpy = Alert.alert as unknown as jest.Mock;
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
    text: string;
    onPress?: () => void | Promise<void>;
  }>;
  const destructive = buttons.find((button) => button.text === 'Delete');
  return destructive?.onPress?.();
}

describe('deleting a model in Storage clears its Ready state in the picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteDownloadedModel as jest.Mock).mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (listInstalledModels as jest.Mock).mockResolvedValue([INSTALLED]);
    useModelInstallStore.setState({
      installedModelIds: [INSTALLED.id],
      readySystemModelIds: [],
      totalRAMMB: 8192,
      allowCellularDownloads: false,
      jobs: { [INSTALLED.id]: { status: 'ready', progress: 1 } },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('drops the model from the install store so the picker stops saying Ready', async () => {
    (listInstalledModels as jest.Mock).mockResolvedValueOnce([INSTALLED]).mockResolvedValue([]);
    const { getByLabelText } = render(<StorageManagerScreen />);
    await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));

    fireEvent.press(getByLabelText(`Delete ${INSTALLED.display_name}`));
    await act(async () => {
      await pressDestructiveAlertButton();
    });

    const state = useModelInstallStore.getState();
    expect(state.installedModelIds).not.toContain(INSTALLED.id);
    expect(state.jobs[INSTALLED.id]).toBeUndefined();
    expect(deleteDownloadedModel).toHaveBeenCalledWith(INSTALLED);
  });

  it.each([null, JSON.stringify({ managedBy: 'react-native-executorch' })])(
    'preserves SDK-managed model state with capabilities %s',
    async (capabilities) => {
      (listInstalledModels as jest.Mock).mockResolvedValue([
        { ...INSTALLED, format: 'pte', local_path: null, capabilities },
      ]);
      const { getByLabelText } = render(<StorageManagerScreen />);
      await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));
      fireEvent.press(getByLabelText(`Delete ${INSTALLED.display_name}`));
      expect(Alert.alert).toHaveBeenCalledWith('Model removal unavailable', expect.any(String));
      expect(deleteDownloadedModel).not.toHaveBeenCalled();
      expect(deleteInstalledModel).not.toHaveBeenCalled();
      expect(useModelInstallStore.getState().installedModelIds).toContain(INSTALLED.id);
      expect(useModelInstallStore.getState().jobs[INSTALLED.id]?.status).toBe('ready');
    },
  );

  it('preserves the record and ready state when file removal fails', async () => {
    (deleteDownloadedModel as jest.Mock).mockRejectedValueOnce(new Error('failed'));
    const { getByLabelText } = render(<StorageManagerScreen />);
    await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));
    fireEvent.press(getByLabelText(`Delete ${INSTALLED.display_name}`));
    await act(async () => {
      await pressDestructiveAlertButton();
    });
    expect(deleteInstalledModel).not.toHaveBeenCalled();
    expect(useModelInstallStore.getState().jobs[INSTALLED.id]?.status).toBe('ready');
    expect(Alert.alert).toHaveBeenCalledWith('Model removal failed', expect.any(String));
  });
});

describe('the download policy is visible and editable in Storage', () => {
  beforeEach(() => {
    (listInstalledModels as jest.Mock).mockResolvedValue([]);
    useModelInstallStore.setState({
      installedModelIds: [],
      readySystemModelIds: [],
      totalRAMMB: 8192,
      allowCellularDownloads: false,
      jobs: {},
    });
  });

  it('shows the consent off by default and turns it on from the screen', async () => {
    const { getByTestId } = render(<StorageManagerScreen />);
    await waitFor(() => getByTestId('storage-cellular-downloads'));

    expect(getByTestId('storage-cellular-downloads').props.value).toBe(false);
    fireEvent(getByTestId('storage-cellular-downloads'), 'valueChange', true);
    expect(useModelInstallStore.getState().allowCellularDownloads).toBe(true);
  });

  it('reports the free space the download check measures against', async () => {
    const { getByTestId } = render(<StorageManagerScreen />);
    await waitFor(() => expect(getByTestId('storage-free-space')).toBeTruthy());
  });
});

describe('a failed storage read is never shown as an empty device', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (listInstalledModels as jest.Mock).mockResolvedValue([INSTALLED]);
    (getModelStorageBytes as jest.Mock).mockResolvedValue(2_000_000_000);
    (getDirectorySizeBytes as jest.Mock).mockResolvedValue(3 * 1024 * 1024);
    (deleteDownloadedModel as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the installed models and cache when only the model folder cannot be measured', async () => {
    (getModelStorageBytes as jest.Mock).mockRejectedValueOnce(new Error('io'));
    const { getByLabelText, getByTestId, queryByText } = render(<StorageManagerScreen />);

    await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));
    expect(getByTestId('storage-model-bytes')).toHaveTextContent('Unavailable');
    expect(getByTestId('storage-cache-bytes')).toHaveTextContent('3.0 MB');
    expect(queryByText(/No models downloaded/)).toBeNull();
    expect(getByLabelText('Try reading storage again')).toBeTruthy();
  });

  it('says the cache is unavailable instead of zero when it cannot be measured', async () => {
    (getDirectorySizeBytes as jest.Mock).mockRejectedValueOnce(new Error('io'));
    const { getByTestId, getByLabelText } = render(<StorageManagerScreen />);

    await waitFor(() =>
      expect(getByTestId('storage-cache-bytes')).toHaveTextContent('Unavailable'),
    );
    expect(getByTestId('storage-model-bytes')).toHaveTextContent('1.86 GB');
    expect(getByLabelText(`Delete ${INSTALLED.display_name}`)).toBeTruthy();
  });

  it('reports an unreadable model list and recovers on retry', async () => {
    (listInstalledModels as jest.Mock).mockRejectedValueOnce(new Error('sqlite'));
    const { getByText, getByLabelText, queryByText } = render(<StorageManagerScreen />);

    await waitFor(() => getByText('Could not read downloaded models.'));
    expect(queryByText(/No models downloaded/)).toBeNull();

    fireEvent.press(getByLabelText('Try reading storage again'));
    await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));
    expect(queryByText('Could not read downloaded models.')).toBeNull();
  });

  it('still says the model was removed when only the refresh after removal fails', async () => {
    const { getByLabelText } = render(<StorageManagerScreen />);
    await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));
    (getModelStorageBytes as jest.Mock).mockRejectedValueOnce(new Error('io'));

    fireEvent.press(getByLabelText(`Delete ${INSTALLED.display_name}`));
    await act(async () => {
      await pressDestructiveAlertButton();
    });

    expect(Alert.alert).toHaveBeenCalledWith('Storage refresh failed', expect.any(String));
    expect(Alert.alert).not.toHaveBeenCalledWith('Model removal failed', expect.any(String));
  });
});

it('hides internal diagnostics when the local wipe fails', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (listInstalledModels as jest.Mock).mockResolvedValue([]);
  (wipeAllLocalData as jest.Mock).mockRejectedValueOnce(new Error('private storage key'));

  const { getByLabelText } = render(<StorageManagerScreen />);
  await waitFor(() => getByLabelText('Delete all local data'));
  fireEvent.press(getByLabelText('Delete all local data'));
  await act(async () => {
    const firstButtons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    firstButtons.find((button) => button.text === 'Delete Everything')?.onPress?.();
    const secondButtons = alertSpy.mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => Promise<void>;
    }>;
    await secondButtons.find((button) => button.text === 'Yes, delete everything')?.onPress?.();
  });

  expect(alertSpy).toHaveBeenCalledWith(
    'Wipe failed',
    'Could not delete all local data. Try again.',
  );
  alertSpy.mockRestore();
});
