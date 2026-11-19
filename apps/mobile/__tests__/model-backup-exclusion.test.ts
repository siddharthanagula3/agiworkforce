import fs from 'fs';
import path from 'path';
import {
  createDownloadResumable,
  getFreeDiskStorageAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import { excludeFromBackup } from '@/src/platform/backupExclusion';
import { insertInstalledModel } from '@/storage/installedModels';
import { downloadModel, excludeModelFilesFromBackup } from '@/services/modelDownload';

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  getFreeDiskStorageAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('@/src/platform/backupExclusion', () => ({
  excludeFromBackup: jest.fn(),
}));

jest.mock('@/storage/installedModels', () => ({
  ...jest.requireActual('@/storage/installedModels'),
  getInstalledModel: jest.fn(async () => null),
  insertInstalledModel: jest.fn(async () => undefined),
  removeInstalledModel: jest.fn(async () => undefined),
}));

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const MODELS_DIR = 'file:///documents/models/';
const EXECUTORCH_DIR = 'file:///documents/react-native-executorch/';
const DEST = `${MODELS_DIR}backup-fixture/model.gguf`;

const mockExclude = excludeFromBackup as jest.Mock;

function downloadOptions() {
  return {
    modelId: 'backup-fixture',
    displayName: 'Backup fixture',
    downloadUrl: 'https://models.example/backup-fixture.gguf',
    checksum: EMPTY_SHA256,
    fileSizeBytes: 1024,
    runtime: 'local' as const,
    format: 'gguf' as const,
    wifiOnly: false,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExclude.mockResolvedValue(undefined);
  (getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(64 * 1024 * 1024 * 1024);
  (getInfoAsync as jest.Mock).mockImplementation(async (uri: string) =>
    uri === DEST ? { exists: true, size: 0 } : { exists: false },
  );
  (createDownloadResumable as jest.Mock).mockReturnValue({
    downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    savable: jest.fn(),
    pauseAsync: jest.fn().mockResolvedValue(undefined),
  });
});

describe('downloaded model files stay out of device backups', () => {
  it('marks both model directories for every model this app downloads', async () => {
    await excludeModelFilesFromBackup();
    expect(mockExclude).toHaveBeenCalledWith([MODELS_DIR, EXECUTORCH_DIR]);
  });

  it('marks the model directory before the download and again once the file is saved', async () => {
    await downloadModel(downloadOptions());

    const downloadOrder = (createDownloadResumable as jest.Mock).mock.invocationCallOrder[0]!;
    const recordOrder = (insertInstalledModel as jest.Mock).mock.invocationCallOrder[0]!;
    const exclusionOrders = mockExclude.mock.invocationCallOrder;
    expect(exclusionOrders.some((order) => order < downloadOrder)).toBe(true);
    expect(exclusionOrders.some((order) => order > downloadOrder && order < recordOrder)).toBe(
      true,
    );
    for (const call of mockExclude.mock.calls) {
      expect(call[0]).toEqual([MODELS_DIR, EXECUTORCH_DIR]);
    }
  });

  it('keeps a finished download when the backup flag cannot be set, and says so in the log', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockExclude.mockRejectedValue(new Error('module missing'));

    await expect(downloadModel(downloadOptions())).resolves.toEqual(
      expect.objectContaining({ id: 'backup-fixture', local_path: DEST }),
    );
    expect(insertInstalledModel).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backup'), expect.any(Error));
    warn.mockRestore();
  });

  it('uses the same directory the ExecuTorch resource fetcher saves its models in', () => {
    const directories = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'node_modules',
        'react-native-executorch-expo-resource-fetcher',
        'lib',
        'constants',
        'directories.js',
      ),
      'utf8',
    );
    expect(directories).toContain('`${Paths.document.uri}react-native-executorch/`');
  });
});
