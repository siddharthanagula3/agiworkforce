const mockRandomUUID = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));

const mockWriteAsStringAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
const mockPhotoPermission = jest.fn();
const mockSaveToLibrary = jest.fn();
const mockSetImage = jest.fn();
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockPhotoPermission(...args),
  saveToLibraryAsync: (...args: unknown[]) => mockSaveToLibrary(...args),
}));
jest.mock('expo-clipboard', () => ({
  setImageAsync: (...args: unknown[]) => mockSetImage(...args),
}));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

const mockGuardedFetch = jest.fn();
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
}));

const mockGetAuthHeaders = jest.fn();
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

import * as Sharing from 'expo-sharing';
import { CLIENT_CAPABILITIES_REQUEST_HEADER } from '@agiworkforce/cloud-contracts';
import {
  FileDownloadError,
  downloadFailureMessage,
  downloadGeneratedFile,
  prepareLocalVideoPlayer,
  shareFile,
  shareGeneratedImage,
  saveGeneratedImageToPhotos,
  copyGeneratedImage,
  viewerFileCopy,
} from '@/services/fileCreation';
import { toUserMessage } from '@/services/userMessage';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: unknown): void {
    this.result = 'data:application/pdf;base64,JVBERi0xLjc=';
    this.onload?.();
  }
}

describe('downloadGeneratedFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let nextExportId = 0;
    mockRandomUUID.mockImplementation(() => `export-${++nextExportId}`);
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === 'file:///cache/exports/',
    }));
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test-jwt' });
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      blob: async () => ({}),
    });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    mockPhotoPermission.mockResolvedValue({ granted: true });
    mockSaveToLibrary.mockResolvedValue(undefined);
    mockSetImage.mockResolvedValue(undefined);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
  });

  it('fetches our-cloud urls through guardedFetch with the Bearer token and writes base64 bytes', async () => {
    const uri = await downloadGeneratedFile(
      'https://agiworkforce.com/api/files/gf-1',
      'report.pdf',
    );

    expect(mockGuardedFetch).toHaveBeenCalledWith('https://agiworkforce.com/api/files/gf-1', {
      headers: { Authorization: 'Bearer test-jwt' },
    });
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/exports/export-1/report.pdf',
      'JVBERi0xLjc=',
      { encoding: 'base64' },
    );
    expect(uri).toBe('file:///cache/exports/export-1/report.pdf');
  });

  it('does NOT attach the Bearer token for non-our-cloud hosts (no JWT leak)', async () => {
    await downloadGeneratedFile('https://media.example/x.pdf', 'x.pdf');
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockGuardedFetch).toHaveBeenCalledWith('https://media.example/x.pdf', { headers: {} });
  });

  it.each([
    ['another site on a shared platform domain', 'https://someone-else.vercel.app/x.pdf'],
    ['another host under the product domain', 'https://files.agiworkforce.com/x.pdf'],
    ['the API host over plain http', 'http://agiworkforce.com/api/files/gf-1'],
    ['the API host on another port', 'https://agiworkforce.com:8443/api/files/gf-1'],
  ])('sends the session token only to the API origin, not to %s', async (_case, url) => {
    await downloadGeneratedFile(url, 'x.pdf');
    await viewerFileCopy(url, 'x.pdf');
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
    for (const call of mockGuardedFetch.mock.calls) expect(call).toEqual([url, { headers: {} }]);
  });

  it('rejects non-absolute urls (relative wire uris must be resolved upstream)', async () => {
    await expect(downloadGeneratedFile('/api/files/gf-1', 'report.pdf')).rejects.toThrow(
      /not absolute/,
    );
    expect(mockGuardedFetch).not.toHaveBeenCalled();
  });

  it('surfaces 401 as a sign-in error instead of writing an empty file', async () => {
    mockGuardedFetch.mockResolvedValue({ ok: false, status: 401, blob: async () => ({}) });
    await expect(
      downloadGeneratedFile('https://agiworkforce.com/api/files/gf-1', 'report.pdf'),
    ).rejects.toThrow(/signed in/);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('a 413 gives the too-large copy and builds no blob', async () => {
    const blob = jest.fn(async () => ({}));
    mockGuardedFetch.mockResolvedValue({ ok: false, status: 413, blob });
    const fileUrl = 'https://agiworkforce.com/api/files/33333333-3333-4333-8333-333333333333';

    const exported = await downloadGeneratedFile(fileUrl, 'dataset.zip').catch((e: unknown) => e);
    const viewed = await viewerFileCopy(fileUrl, 'dataset.zip').catch((e: unknown) => e);

    for (const error of [exported, viewed]) {
      expect(error).toBeInstanceOf(FileDownloadError);
      expect(downloadFailureMessage(error, 'Download failed')).toBe(
        'This file is too large to open on this device.',
      );
      expect(toUserMessage(error, 'This file could not be opened. Check your connection.')).toBe(
        'This file is too large to open on this device.',
      );
    }
    expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
    expect(blob).not.toHaveBeenCalled();
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('keeps the plain copy of other refusals on the viewer path', () => {
    const fallback = 'This file could not be opened. Check your connection.';
    expect(toUserMessage(new FileDownloadError(404), fallback)).toBe(
      'That is no longer available.',
    );
    expect(toUserMessage(new FileDownloadError(429), fallback)).toBe(
      'You are going a little fast. Wait a moment and try again.',
    );
    expect(toUserMessage(new FileDownloadError(500), fallback)).toBe(
      'Something went wrong on our side. Try again shortly.',
    );
    expect(toUserMessage(new FileDownloadError(400), fallback)).toBe(fallback);
  });

  it('no file request carries x-agi-client-capabilities', async () => {
    await downloadGeneratedFile('https://agiworkforce.com/api/files/gf-1', 'report.pdf');
    await viewerFileCopy('https://agiworkforce.com/api/files/gf-2', 'report.pdf');

    expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
    for (const [, init] of mockGuardedFetch.mock.calls as [string, RequestInit][]) {
      const names = Object.keys(init.headers ?? {}).map((name) => name.toLowerCase());
      expect(names).not.toContain(CLIENT_CAPABILITIES_REQUEST_HEADER.toLowerCase());
    }
  });

  it('surfaces other HTTP failures with the status code', async () => {
    mockGuardedFetch.mockResolvedValue({ ok: false, status: 503, blob: async () => ({}) });
    await expect(
      downloadGeneratedFile('https://agiworkforce.com/api/files/gf-1', 'report.pdf'),
    ).rejects.toThrow(/HTTP 503/);
  });

  it('materializes an owner-scoped image to a local file before opening the share sheet', async () => {
    const imagePath = '/api/files/22222222-2222-4222-8222-222222222222';

    await shareGeneratedImage(imagePath);

    expect(mockGuardedFetch).toHaveBeenCalledWith(
      'https://agiworkforce.com/api/files/22222222-2222-4222-8222-222222222222',
      { headers: { Authorization: 'Bearer test-jwt' } },
    );
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/exports/export-1/generated-image.png',
      'JVBERi0xLjc=',
      { encoding: 'base64' },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/exports/export-1/generated-image.png',
      {
        mimeType: 'image/png',
        dialogTitle: 'Share generated image',
      },
    );
  });

  it('never shares an external or inline image URL as if it were durable media', async () => {
    await expect(shareGeneratedImage('https://evil.example/tracker.png')).rejects.toThrow(
      /saved AGI Cloud images/,
    );
    expect(mockGuardedFetch).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ])('preserves %s bytes and extension when sharing', async (mimeType, extension) => {
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => mimeType },
      blob: async () => ({}),
    });

    await shareGeneratedImage('/api/files/22222222-2222-4222-8222-222222222222');

    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      `file:///cache/exports/export-1/generated-image.${extension}`,
      'JVBERi0xLjc=',
      { encoding: 'base64' },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///cache/exports/export-1/generated-image.${extension}`,
      expect.objectContaining({ mimeType }),
    );
  });

  function respondWithContentType(contentType: string) {
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => contentType },
      blob: async () => ({}),
    });
  }

  function trackWrittenFiles(): Set<string> {
    const files = new Set<string>(['file:///cache/exports/']);
    const fileSystem = jest.requireMock('expo-file-system/legacy') as {
      moveAsync: jest.Mock;
    };
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({ exists: files.has(uri) }));
    mockMakeDirectoryAsync.mockImplementation(async (uri: string) => {
      files.add(uri);
    });
    mockWriteAsStringAsync.mockImplementation(async (uri: string) => {
      files.add(uri);
    });
    fileSystem.moveAsync.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
      files.delete(from);
      files.add(to);
    });
    return files;
  }

  it('keeps a video preview in the account cache and replays it without downloading again', async () => {
    respondWithContentType('video/mp4');
    trackWrittenFiles();
    activateCloudAccount('user_a');

    const first = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-1',
      '#000',
    );
    const second = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-1',
      '#fff',
    );

    expect(mockGuardedFetch).toHaveBeenCalledTimes(1);
    expect(first.directoryUri).toBe('file:///cache/video-previews/user_a/video-1/');
    expect(second.videoUri).toBe(first.videoUri);
    expect(first.videoUri).toBe(`${first.directoryUri}video-video-1.mp4`);
    expect(second.playerUri).toBe(`${second.directoryUri}player.html`);
    expect(mockWriteAsStringAsync).toHaveBeenLastCalledWith(
      second.playerUri,
      expect.stringContaining('background:#fff'),
      { encoding: 'utf8' },
    );
  });

  it('downloads again for another account instead of reusing its cached preview', async () => {
    respondWithContentType('video/mp4');
    trackWrittenFiles();
    activateCloudAccount('user_a');
    const first = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-1',
      '#000',
    );
    activateCloudAccount('user_b');

    const second = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-1',
      '#000',
    );

    expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
    expect(second.directoryUri).toBe('file:///cache/video-previews/user_b/video-1/');
    expect(second.videoUri).not.toBe(first.videoUri);
  });

  it('uses a one-off cache folder when no account owns the preview', async () => {
    respondWithContentType('video/mp4');
    trackWrittenFiles();
    __resetCloudAccountSessionForTests();

    const first = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-1',
      '#000',
    );
    const second = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-1',
      '#000',
    );

    expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
    expect(first.directoryUri).toMatch(/^file:\/\/\/cache\/video-previews\/transient\//);
    expect(second.directoryUri).not.toBe(first.directoryUri);
  });

  it.each([
    ['video/webm', 'webm'],
    ['video/quicktime', 'mov'],
  ])('keeps the %s container in the local video name', async (contentType, extension) => {
    respondWithContentType(contentType);

    const prepared = await prepareLocalVideoPlayer(
      'https://agiworkforce.com/api/files/video-2',
      '#000',
    );

    expect(prepared.videoUri).toBe(`${prepared.directoryUri}video-video-2.${extension}`);
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      prepared.playerUri,
      expect.stringContaining(`<video src="video-video-2.${extension}"`),
      { encoding: 'utf8' },
    );
  });

  it.each(['text/html', 'application/octet-stream'])(
    'refuses to name %s bytes as a video',
    async (contentType) => {
      respondWithContentType(contentType);

      await expect(
        prepareLocalVideoPlayer('https://agiworkforce.com/api/files/video-3', '#000'),
      ).rejects.toThrow(/video format is not supported/);
      expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['mp4', 'public.mpeg-4', 'video/mp4'],
    ['mov', 'com.apple.quicktime-movie', 'video/quicktime'],
    ['webm', 'public.movie', 'video/webm'],
  ])('shares a .%s file with video metadata', async (extension, uti, mimeType) => {
    await shareFile(`file:///cache/exports/export-1/video.${extension}`);

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///cache/exports/export-1/video.${extension}`,
      { UTI: uti, mimeType },
    );
  });

  it.each([
    ['gif', 'com.compuserve.gif', 'image/gif'],
    ['webp', 'org.webmproject.webp', 'image/webp'],
    ['mp3', 'public.mp3', 'audio/mpeg'],
    ['wav', 'com.microsoft.waveform-audio', 'audio/wav'],
    ['m4a', 'public.mpeg-4-audio', 'audio/mp4'],
    ['txt', 'public.plain-text', 'text/plain'],
  ])('shares a .%s file with its own type', async (extension, uti, mimeType) => {
    await shareFile(`file:///cache/exports/export-1/file.${extension}`);

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///cache/exports/export-1/file.${extension}`,
      { UTI: uti, mimeType },
    );
  });

  it.each(['ts', 'tsx', 'mts', 'cts', 'py', 'rs', 'kt', 'swift', 'sh', 'yml', 'sql'])(
    'shares a .%s source file as plain text and keeps its name',
    async (extension) => {
      await shareFile(`file:///cache/exports/export-1/code.${extension}`);

      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        `file:///cache/exports/export-1/code.${extension}`,
        { UTI: 'public.plain-text', mimeType: 'text/plain' },
      );
    },
  );

  it('does not claim a type it does not know when sharing', async () => {
    await shareFile('file:///cache/exports/export-1/notes.unknownext');

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/exports/export-1/notes.unknownext',
      {},
    );
  });

  it.each([true, false])(
    'does not share or throw after retired availability resolves %s',
    async (available) => {
      let resolve!: (value: boolean) => void;
      (Sharing.isAvailableAsync as jest.Mock).mockReturnValueOnce(
        new Promise<boolean>((done) => {
          resolve = done;
        }),
      );
      let current = true;
      const sharing = shareFile('file:///docs/video.mp4', { isCurrent: () => current });
      current = false;
      resolve(available);
      await expect(sharing).resolves.toBeUndefined();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    },
  );

  it('does not check sharing availability for an already retired action', async () => {
    await shareFile('file:///docs/video.mp4', { isCurrent: () => false });
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it.each([true, false])('retires image sharing during availability (%s)', async (available) => {
    let current = true;
    (Sharing.isAvailableAsync as jest.Mock).mockImplementationOnce(async () => {
      current = false;
      return available;
    });
    await shareGeneratedImage('/api/files/22222222-2222-4222-8222-222222222222', 'kept-name', {
      isCurrent: () => current,
    });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it.each([true, false])('retires photo save during permission (%s)', async (granted) => {
    let current = true;
    mockPhotoPermission.mockImplementationOnce(async () => {
      current = false;
      return { granted };
    });
    await saveGeneratedImageToPhotos('/api/files/22222222-2222-4222-8222-222222222222', undefined, {
      isCurrent: () => current,
    });
    expect(mockGuardedFetch).not.toHaveBeenCalled();
    expect(mockSaveToLibrary).not.toHaveBeenCalled();
  });

  it('retires photo save after the file write without dispatching Photos', async () => {
    let current = true;
    mockWriteAsStringAsync.mockImplementationOnce(async () => {
      current = false;
    });
    await saveGeneratedImageToPhotos('/api/files/22222222-2222-4222-8222-222222222222', undefined, {
      isCurrent: () => current,
    });
    expect(mockWriteAsStringAsync).toHaveBeenCalled();
    expect(mockSaveToLibrary).not.toHaveBeenCalled();
  });

  it('retires copy during download without dispatching Clipboard', async () => {
    let current = true;
    mockGuardedFetch.mockImplementationOnce(async () => {
      current = false;
      return { ok: true, headers: { get: () => 'image/png' }, blob: async () => ({}) };
    });
    await copyGeneratedImage('/api/files/22222222-2222-4222-8222-222222222222', {
      isCurrent: () => current,
    });
    expect(mockSetImage).not.toHaveBeenCalled();
  });

  it('preserves default Photos and Clipboard callers and exact bytes', async () => {
    const path = '/api/files/22222222-2222-4222-8222-222222222222';
    await saveGeneratedImageToPhotos(path, 'kept-name');
    expect(mockSaveToLibrary).toHaveBeenCalledWith('file:///cache/exports/export-1/kept-name.png');
    await copyGeneratedImage(path);
    expect(mockSetImage).toHaveBeenCalledWith('JVBERi0xLjc=');
  });
});
