import NetInfo from '@react-native-community/netinfo';
import {
  createDownloadResumable,
  deleteAsync,
  getFreeDiskStorageAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import { getInstalledModel, insertInstalledModel } from '@/storage/installedModels';
import type { InstalledModel } from '@/storage/types';
import {
  assertDownloadAllowed,
  assertFreeSpaceFor,
  cancelDownload,
  downloadModel,
  deleteDownloadedModel,
  modelRemovalUnsupportedReason,
  ModelDownloadError,
} from '@/services/modelDownload';
import {
  GENERIC_INSTALL_FAILURE,
  installFailureMessage,
} from '@/src/features/model-picker/installStore';

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  getFreeDiskStorageAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('@/storage/installedModels', () => ({
  ...jest.requireActual('@/storage/installedModels'),
  getInstalledModel: jest.fn(async () => null),
  insertInstalledModel: jest.fn(async () => undefined),
}));

const mockFetch = NetInfo.fetch as jest.Mock;
const mockFreeSpace = getFreeDiskStorageAsync as jest.Mock;

const GB = 1024 * 1024 * 1024;

describe('owned model removal', () => {
  const installed: InstalledModel = {
    id: 'owned-fixture',
    display_name: 'Owned fixture',
    runtime: 'local',
    format: 'gguf',
    size_bytes: GB,
    sha256: 'a'.repeat(64),
    local_path: 'file:///documents/models/owned-fixture/model.gguf',
    installed_at: 1,
    last_used_at: null,
    capabilities: null,
  };

  beforeEach(() => {
    (deleteAsync as jest.Mock).mockClear();
    (getInstalledModel as jest.Mock).mockResolvedValue(installed);
  });

  afterEach(() => {
    (getInstalledModel as jest.Mock).mockResolvedValue(null);
  });

  it.each([
    { format: 'pte', local_path: null },
    { capabilities: JSON.stringify({ managedBy: 'react-native-executorch' }) },
    { capabilities: '{invalid' },
    { capabilities: 'null' },
    { local_path: 'file:///elsewhere/model.gguf' },
    { id: '..', local_path: 'file:///documents/models/../model.gguf' },
    { id: '.', local_path: 'file:///documents/models/./model.gguf' },
    { id: 'a/b', local_path: 'file:///documents/models/a_b/model.gguf' },
  ])('rejects unsupported ownership %s without deleting files', async (overrides) => {
    const unsupported = { ...installed, ...overrides } as InstalledModel;
    expect(modelRemovalUnsupportedReason(unsupported)).not.toBeNull();
    await expect(deleteDownloadedModel(unsupported)).rejects.toThrow();
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it.each([null, { ...installed, installed_at: 2 }, { ...installed, sha256: 'b'.repeat(64) }])(
    'rejects a missing or replaced installation before deletion',
    async (current) => {
      (getInstalledModel as jest.Mock).mockResolvedValue(current);
      await expect(deleteDownloadedModel(installed)).rejects.toThrow('installed model changed');
      expect(deleteAsync).not.toHaveBeenCalled();
    },
  );

  it('removes the confirmed owned directory despite last-used updates', async () => {
    (getInstalledModel as jest.Mock).mockResolvedValue({ ...installed, last_used_at: 2 });
    await expect(deleteDownloadedModel(installed)).resolves.toBeUndefined();
    expect(deleteAsync).toHaveBeenCalledWith('file:///documents/models/owned-fixture/', {
      idempotent: true,
    });
  });
});

function onNetwork(type: string, isConnected = true) {
  mockFetch.mockResolvedValue({ type, isConnected, isInternetReachable: isConnected });
}

describe('download network consent', () => {
  beforeEach(() => {
    mockFreeSpace.mockResolvedValue(64 * GB);
  });

  it('refuses a Wi-Fi-only download on cellular and names the setting that lifts it', async () => {
    onNetwork('cellular');
    const error = await assertDownloadAllowed({ wifiOnly: true, requiredBytes: GB }).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(ModelDownloadError);
    expect((error as ModelDownloadError).kind).toBe('wifi_required');
    expect((error as ModelDownloadError).message).toContain('Download over cellular');
  });

  it('allows a cellular download once the consent is on', async () => {
    onNetwork('cellular');
    await expect(
      assertDownloadAllowed({ wifiOnly: false, requiredBytes: GB }),
    ).resolves.toBeUndefined();
  });

  it('allows a Wi-Fi download with the consent off', async () => {
    onNetwork('wifi');
    await expect(
      assertDownloadAllowed({ wifiOnly: true, requiredBytes: GB }),
    ).resolves.toBeUndefined();
  });

  it('refuses when the device is offline, whatever the consent says', async () => {
    onNetwork('none', false);
    const error = await assertDownloadAllowed({ wifiOnly: false, requiredBytes: GB }).catch(
      (err: unknown) => err,
    );
    expect((error as ModelDownloadError).kind).toBe('offline');
  });
});

describe('free space check', () => {
  it('refuses a download when the platform reports zero free bytes', async () => {
    mockFreeSpace.mockResolvedValue(0);
    await expect(assertFreeSpaceFor(GB)).rejects.toMatchObject({ kind: 'storage_full' });
  });

  it('allows exactly the model size plus required headroom', async () => {
    mockFreeSpace.mockResolvedValue(GB + 256 * 1024 * 1024);
    await expect(assertFreeSpaceFor(GB)).resolves.toBeUndefined();
  });

  it('refuses one byte below the model size plus required headroom', async () => {
    mockFreeSpace.mockResolvedValue(GB + 256 * 1024 * 1024 - 1);
    await expect(assertFreeSpaceFor(GB)).rejects.toMatchObject({ kind: 'storage_full' });
  });

  it.each([NaN, Infinity, -Infinity, -1])(
    'preserves unavailable free-space handling for %s',
    async (freeBytes) => {
      mockFreeSpace.mockResolvedValue(freeBytes);
      await expect(assertFreeSpaceFor(GB)).resolves.toBeUndefined();
    },
  );

  it('refuses a model larger than the free space and reports both numbers', async () => {
    mockFreeSpace.mockResolvedValue(2 * GB);
    const error = await assertFreeSpaceFor(4 * GB).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ModelDownloadError);
    expect((error as ModelDownloadError).kind).toBe('storage_full');
    expect((error as ModelDownloadError).message).toContain('2.0 GB');
  });

  it('passes when there is room for the model plus headroom', async () => {
    mockFreeSpace.mockResolvedValue(8 * GB);
    await expect(assertFreeSpaceFor(4 * GB)).resolves.toBeUndefined();
  });

  it('does not block the download when the platform cannot report free space', async () => {
    mockFreeSpace.mockRejectedValue(new Error('unsupported'));
    await expect(assertFreeSpaceFor(400 * GB)).resolves.toBeUndefined();
  });

  it('runs before the network gate has a chance to pass a too-large model', async () => {
    onNetwork('wifi');
    mockFreeSpace.mockResolvedValue(1 * GB);
    const error = await assertDownloadAllowed({ wifiOnly: true, requiredBytes: 6 * GB }).catch(
      (err: unknown) => err,
    );
    expect((error as ModelDownloadError).kind).toBe('storage_full');
  });
});

describe('install failure messages', () => {
  it('reports the real cause of a typed download failure', () => {
    expect(
      installFailureMessage(new ModelDownloadError('wifi_required', 'This download needs Wi-Fi.')),
    ).toBe('This download needs Wi-Fi.');
    expect(
      installFailureMessage(new ModelDownloadError('storage_full', 'Needs 4.0 GB free.')),
    ).toBe('Needs 4.0 GB free.');
  });

  it('keeps the generic wording for an untyped failure rather than inventing a cause', () => {
    expect(installFailureMessage(new Error('boom'))).toBe(GENERIC_INSTALL_FAILURE);
    expect(installFailureMessage('boom')).toBe(GENERIC_INSTALL_FAILURE);
  });
});

describe('cancelling a download', () => {
  it('reports a download the user cancelled as cancelled, not as a network failure', async () => {
    onNetwork('wifi');
    mockFreeSpace.mockResolvedValue(64 * GB);
    let settle: (result: undefined) => void = () => undefined;
    const mockCreate = createDownloadResumable as jest.Mock;
    mockCreate.mockReturnValue({
      downloadAsync: () =>
        new Promise<undefined>((resolve) => {
          settle = resolve;
        }),
      pauseAsync: jest.fn(async () => {
        settle(undefined);
        return {};
      }),
      savable: jest.fn(async () => ({})),
    });

    const download = downloadModel({
      modelId: 'model-a',
      displayName: 'Model A',
      downloadUrl: 'https://models.example/model-a.gguf',
      checksum: 'a'.repeat(64),
      fileSizeBytes: 1024,
      runtime: 'local',
      format: 'gguf',
      wifiOnly: true,
    });
    for (let tick = 0; tick < 50 && mockCreate.mock.calls.length === 0; tick += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    cancelDownload('model-a');

    await expect(download).rejects.toMatchObject({ kind: 'cancelled' });
  });

  const EMPTY_FILE_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  function modelOptions(modelId: string, checksum: string) {
    return {
      modelId,
      displayName: 'Cancel fixture',
      downloadUrl: `https://models.example/${modelId}.gguf`,
      checksum,
      fileSizeBytes: 1024,
      runtime: 'local' as const,
      format: 'gguf' as const,
      wifiOnly: true,
    };
  }

  it('honours a cancel that lands before any download handle exists', async () => {
    onNetwork('wifi');
    mockFreeSpace.mockResolvedValue(64 * GB);
    const mockCreate = createDownloadResumable as jest.Mock;
    mockCreate.mockClear();
    (insertInstalledModel as jest.Mock).mockClear();
    let releaseLookup: (value: null) => void = () => undefined;
    (getInstalledModel as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          releaseLookup = resolve;
        }),
    );

    const download = downloadModel(modelOptions('model-preflight', 'a'.repeat(64)));
    cancelDownload('model-preflight');
    releaseLookup(null);

    await expect(download).rejects.toMatchObject({ kind: 'cancelled' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(insertInstalledModel).not.toHaveBeenCalled();
  });

  it('does not record an installation cancelled while the file was being verified', async () => {
    onNetwork('wifi');
    mockFreeSpace.mockResolvedValue(64 * GB);
    (insertInstalledModel as jest.Mock).mockClear();
    (createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: async () => ({ status: 200 }),
      pauseAsync: jest.fn(async () => ({})),
      savable: jest.fn(async () => ({})),
    });
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
      const isModelFile = path.endsWith('/model.gguf');
      if (isModelFile) cancelDownload('model-verify');
      return { exists: isModelFile, size: 0 };
    });

    try {
      await expect(
        downloadModel(modelOptions('model-verify', EMPTY_FILE_SHA256)),
      ).rejects.toMatchObject({ kind: 'cancelled' });
      expect(insertInstalledModel).not.toHaveBeenCalled();
    } finally {
      (getInfoAsync as jest.Mock).mockReset().mockResolvedValue({ exists: false });
    }
  });

  it('records an installation nobody cancelled', async () => {
    onNetwork('wifi');
    mockFreeSpace.mockResolvedValue(64 * GB);
    (insertInstalledModel as jest.Mock).mockClear();
    (createDownloadResumable as jest.Mock).mockReturnValue({
      downloadAsync: async () => ({ status: 200 }),
      pauseAsync: jest.fn(async () => ({})),
      savable: jest.fn(async () => ({})),
    });
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => ({
      exists: path.endsWith('/model.gguf'),
      size: 0,
    }));

    try {
      await expect(
        downloadModel(modelOptions('model-clean', EMPTY_FILE_SHA256)),
      ).resolves.toMatchObject({ id: 'model-clean' });
      expect(insertInstalledModel).toHaveBeenCalledTimes(1);
    } finally {
      (getInfoAsync as jest.Mock).mockReset().mockResolvedValue({ exists: false });
    }
  });
});

describe('download progress', () => {
  it('reports once per percent while the file system reports every chunk', async () => {
    onNetwork('wifi');
    mockFreeSpace.mockResolvedValue(64 * GB);
    const totalBytes = 20_000;
    (createDownloadResumable as jest.Mock).mockImplementation(
      (
        _url: string,
        _dest: string,
        _options: unknown,
        onChunk?: (data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
      ) => ({
        downloadAsync: async () => {
          for (let written = 1; written <= totalBytes; written += 1) {
            onChunk?.({ totalBytesWritten: written, totalBytesExpectedToWrite: totalBytes });
          }
          return { status: 200 };
        },
        pauseAsync: jest.fn(async () => ({})),
        savable: jest.fn(async () => ({})),
      }),
    );
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => ({
      exists: path.endsWith('/model.gguf'),
      size: 0,
    }));
    const shown: number[] = [];

    try {
      await downloadModel({
        modelId: 'model-progress',
        displayName: 'Progress fixture',
        downloadUrl: 'https://models.example/model-progress.gguf',
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        fileSizeBytes: totalBytes,
        runtime: 'local',
        format: 'gguf',
        wifiOnly: true,
        onProgress: (written, total) => shown.push(written / total),
      });
    } finally {
      (getInfoAsync as jest.Mock).mockReset().mockResolvedValue({ exists: false });
      (createDownloadResumable as jest.Mock).mockReset();
    }

    expect(shown.length).toBeLessThanOrEqual(101);
    expect(shown[shown.length - 1]).toBe(1);
  });
});
