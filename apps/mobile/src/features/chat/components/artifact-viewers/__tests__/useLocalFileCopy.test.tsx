const mockDownloadGeneratedFile = jest.fn();
const mockViewerFileCopy = jest.fn();

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  viewerFileCopy: (...args: unknown[]) => mockViewerFileCopy(...args),
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { localFileCopy, useLocalFileCopy } from '../useLocalFileCopy';

describe('local file copies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('passes a file already on the device through untouched', async () => {
    const { result } = renderHook(() => useLocalFileCopy('file:///local/d.txt', 'd.txt'));
    await waitFor(() =>
      expect(result.current.copy).toEqual({ status: 'ready', uri: 'file:///local/d.txt' }),
    );
    expect(mockViewerFileCopy).not.toHaveBeenCalled();
  });
});
