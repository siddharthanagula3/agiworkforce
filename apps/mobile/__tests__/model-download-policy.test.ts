import NetInfo from '@react-native-community/netinfo';
import { getFreeDiskStorageAsync } from 'expo-file-system/legacy';
import {
  assertDownloadAllowed,
  assertFreeSpaceFor,
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

const mockFetch = NetInfo.fetch as jest.Mock;
const mockFreeSpace = getFreeDiskStorageAsync as jest.Mock;

const GB = 1024 * 1024 * 1024;

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
