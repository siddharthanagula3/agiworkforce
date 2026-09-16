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
  local_path: 'file:///models/local-fixture/model.gguf',
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
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getFreeDiskStorageAsync: jest.fn().mockResolvedValue(12 * 1024 * 1024 * 1024),
}));

jest.mock('@/storage/installedModels', () => ({
  listInstalledModels: jest.fn(),
  deleteInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/modelDownload', () => ({
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
  buildLocalDataExportSnapshot: jest.fn().mockReturnValue({}),
  resetLocalInMemoryState: jest.fn(),
}));

jest.mock('@/src/features/settings/storageUsage', () => ({
  getDirectorySizeBytes: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/src/features/settings/StorageScopeNotice', () => ({
  StorageScopeNotice: () => null,
}));

import { listInstalledModels } from '@/storage/installedModels';
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
    const { getByLabelText } = render(<StorageManagerScreen />);
    await waitFor(() => getByLabelText(`Delete ${INSTALLED.display_name}`));

    fireEvent.press(getByLabelText(`Delete ${INSTALLED.display_name}`));
    await act(async () => {
      await pressDestructiveAlertButton();
    });

    const state = useModelInstallStore.getState();
    expect(state.installedModelIds).not.toContain(INSTALLED.id);
    expect(state.jobs[INSTALLED.id]).toBeUndefined();
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
