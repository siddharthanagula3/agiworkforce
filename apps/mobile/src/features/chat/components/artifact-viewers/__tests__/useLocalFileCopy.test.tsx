type FileSystemLegacyModule = typeof import('expo-file-system/legacy');

const mockDownloadGeneratedFile = jest.fn();
const mockViewerFileCopy = jest.fn();
const mockGetInfoAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual<FileSystemLegacyModule>('expo-file-system/legacy'),
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  viewerFileCopy: (...args: unknown[]) => mockViewerFileCopy(...args),
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { ApiHttpError } from '@/services/apiErrors';
import { localFileCopy, useLocalFileCopy } from '../useLocalFileCopy';

describe('local file copies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue({ exists: true });
  });

  it('views a cloud file from a cache copy and never writes it to the exports folder', async () => {
    mockViewerFileCopy.mockResolvedValue('file:///cache/file-views/accounts/user-1/v-1/a.pdf');
    const { result } = renderHook(() =>
      useLocalFileCopy('https://files.example.test/api/files/v-1', 'a.pdf'),
    );

    await waitFor(() =>
      expect(result.current.copy).toEqual({
        status: 'ready',
        uri: 'file:///cache/file-views/accounts/user-1/v-1/a.pdf',
      }),
    );
    expect(mockViewerFileCopy).toHaveBeenCalledWith(
      'https://files.example.test/api/files/v-1',
      'a.pdf',
    );
    expect(mockDownloadGeneratedFile).not.toHaveBeenCalled();
  });

  it('asks for the cache copy again after it finished, so a removed copy is made again', async () => {
    mockViewerFileCopy.mockResolvedValue('file:///cache/file-views/accounts/user-1/v-2/b.pdf');
    const url = 'https://files.example.test/api/files/v-2';
    const first = renderHook(() => useLocalFileCopy(url, 'b.pdf'));
    await waitFor(() => expect(first.result.current.copy.status).toBe('ready'));
    first.unmount();

    const second = renderHook(() => useLocalFileCopy(url, 'b.pdf'));
    await waitFor(() => expect(second.result.current.copy.status).toBe('ready'));
    expect(mockViewerFileCopy).toHaveBeenCalledTimes(2);
  });

  it('keeps a shared file in the exports folder as before', async () => {
    mockDownloadGeneratedFile.mockResolvedValue('file:///docs/exports/e-1/c.pdf');
    await expect(localFileCopy('https://files.example.test/api/files/v-3', 'c.pdf')).resolves.toBe(
      'file:///docs/exports/e-1/c.pdf',
    );
    expect(mockViewerFileCopy).not.toHaveBeenCalled();
  });

  it('shares the remembered export again without fetching it while its file is still there', async () => {
    const url = 'https://files.example.test/api/files/v-4';
    mockDownloadGeneratedFile.mockResolvedValue('file:///cache/exports/e-4/d.pdf');

    await expect(localFileCopy(url, 'd.pdf')).resolves.toBe('file:///cache/exports/e-4/d.pdf');
    await expect(localFileCopy(url, 'd.pdf')).resolves.toBe('file:///cache/exports/e-4/d.pdf');

    expect(mockGetInfoAsync).toHaveBeenCalledWith('file:///cache/exports/e-4/d.pdf');
    expect(mockDownloadGeneratedFile).toHaveBeenCalledTimes(1);
  });

  it('makes a fresh export when the remembered one was cleared from the cache', async () => {
    const url = 'https://files.example.test/api/files/v-5';
    mockDownloadGeneratedFile
      .mockResolvedValueOnce('file:///cache/exports/e-5/e.pdf')
      .mockResolvedValueOnce('file:///cache/exports/e-6/e.pdf');
    await localFileCopy(url, 'e.pdf');
    mockGetInfoAsync.mockResolvedValueOnce({ exists: false });

    await expect(localFileCopy(url, 'e.pdf')).resolves.toBe('file:///cache/exports/e-6/e.pdf');
    await expect(localFileCopy(url, 'e.pdf')).resolves.toBe('file:///cache/exports/e-6/e.pdf');

    expect(mockDownloadGeneratedFile).toHaveBeenCalledTimes(2);
  });

  it('makes a fresh export when the remembered one cannot be checked', async () => {
    const url = 'https://files.example.test/api/files/v-7';
    mockDownloadGeneratedFile
      .mockResolvedValueOnce('file:///cache/exports/e-7/f.pdf')
      .mockResolvedValueOnce('file:///cache/exports/e-8/f.pdf');
    await localFileCopy(url, 'f.pdf');
    mockGetInfoAsync.mockRejectedValueOnce(new Error('No such directory'));

    await expect(localFileCopy(url, 'f.pdf')).resolves.toBe('file:///cache/exports/e-8/f.pdf');
    expect(mockDownloadGeneratedFile).toHaveBeenCalledTimes(2);
  });

  it('makes one fresh export when two shares find the remembered one gone at once', async () => {
    const url = 'https://files.example.test/api/files/v-9';
    mockDownloadGeneratedFile
      .mockResolvedValueOnce('file:///cache/exports/e-9/g.pdf')
      .mockResolvedValueOnce('file:///cache/exports/e-10/g.pdf');
    await localFileCopy(url, 'g.pdf');
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: false });

    const shares = await Promise.all([localFileCopy(url, 'g.pdf'), localFileCopy(url, 'g.pdf')]);

    expect(shares).toEqual([
      'file:///cache/exports/e-10/g.pdf',
      'file:///cache/exports/e-10/g.pdf',
    ]);
    expect(mockDownloadGeneratedFile).toHaveBeenCalledTimes(2);
  });

  it('marks a file above the download limit as a failure that asking again cannot fix', async () => {
    mockViewerFileCopy.mockRejectedValueOnce(
      new ApiHttpError('This file is too large to open on this device.', 413, 'file_too_large'),
    );
    const { result } = renderHook(() =>
      useLocalFileCopy('https://files.example.test/api/files/v-11', 'h.pdf'),
    );

    await waitFor(() =>
      expect(result.current.copy).toEqual({
        status: 'failed',
        message: 'This file is too large to open on this device.',
        retryable: false,
      }),
    );
  });

  it('keeps any other failed copy retryable', async () => {
    mockViewerFileCopy.mockRejectedValueOnce(new Error('Download failed (HTTP 500)'));
    const { result } = renderHook(() =>
      useLocalFileCopy('https://files.example.test/api/files/v-12', 'i.pdf'),
    );

    await waitFor(() =>
      expect(result.current.copy).toEqual({
        status: 'failed',
        message: 'Something went wrong on our side. Try again shortly.',
        retryable: true,
      }),
    );
  });

  it('passes a file already on the device through untouched', async () => {
    const { result } = renderHook(() => useLocalFileCopy('file:///local/d.txt', 'd.txt'));
    await waitFor(() =>
      expect(result.current.copy).toEqual({ status: 'ready', uri: 'file:///local/d.txt' }),
    );
    expect(mockViewerFileCopy).not.toHaveBeenCalled();
  });
});
