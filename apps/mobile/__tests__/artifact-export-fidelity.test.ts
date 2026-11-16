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
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: (...args: unknown[]) => mockPhotoPermission(...args),
  saveToLibraryAsync: (...args: unknown[]) => mockSaveToLibrary(...args),
}));
const mockSetImage = jest.fn();
jest.mock('expo-clipboard', () => ({
  setImageAsync: (...args: unknown[]) => mockSetImage(...args),
}));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

const mockGuardedFetch = jest.fn();
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
  isOurCloudHost: (host: string) =>
    host === 'agiworkforce.com' || host.endsWith('.agiworkforce.com'),
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer test-jwt' })),
}));

import * as Sharing from 'expo-sharing';
import { spreadsheetSafeExport } from '@agiworkforce/unified-chat/tabular';
import { sanitizeFilename } from '@agiworkforce/unified-chat/filename';
import {
  FileDownloadError,
  PhotosPermissionError,
  copyGeneratedImage,
  downloadFailureMessage,
  downloadGeneratedFile,
  downloadGeneratedFileAsManagedFile,
  exportSourceFile,
  exportToMarkdown,
  exportToText,
  saveGeneratedImageToPhotos,
  shareFile,
  shareGeneratedImage,
} from '@/services/fileCreation';
import {
  artifactExportOptions,
  artifactSourceExtension,
  exportArtifact,
} from '@/src/features/chat/utils/artifactExport';

const FALLBACK = 'Could not download or share this file. Try again.';

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: unknown): void {
    this.result = 'data:application/octet-stream;base64,R0lGODlh';
    this.onload?.();
  }
}

function respond(contentType: string) {
  mockGuardedFetch.mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    blob: async () => ({}),
  });
}

function written(): { uri: string; body: string } {
  const call = mockWriteAsStringAsync.mock.calls[mockWriteAsStringAsync.mock.calls.length - 1];
  return { uri: String(call?.[0]), body: String(call?.[1]) };
}

beforeEach(() => {
  jest.clearAllMocks();
  let nextExportId = 0;
  mockRandomUUID.mockImplementation(() => `export-${++nextExportId}`);
  (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
  mockGetInfoAsync.mockImplementation(async (uri: string) => ({
    exists: uri === 'file:///docs/exports/',
  }));
  mockWriteAsStringAsync.mockResolvedValue(undefined);
  mockPhotoPermission.mockResolvedValue({ granted: true });
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
});

describe('artifact exports are the artifact', () => {
  it('writes a Markdown export byte for byte, with no title or date added', async () => {
    const content = '# Plan\n\n- ship\n- tell people\n';
    await exportToMarkdown(content, 'Plan');
    expect(written().body).toBe(content);
  });

  it('writes a text export byte for byte', async () => {
    await exportToText('one\ntwo', 'Notes');
    expect(written()).toEqual({ uri: 'file:///docs/exports/export-1/Notes.txt', body: 'one\ntwo' });
  });

  it('guards formula cells of a CSV artifact exactly as the shared spreadsheet export does', async () => {
    const csv = 'name,link\nAda,=HYPERLINK("https://evil.example","open")\n';
    const [option] = artifactExportOptions({ type: 'code', language: 'csv' });
    expect(option?.extension).toBe('csv');

    const uri = await exportArtifact(csv, 'People', option!);

    expect(uri).toBe('file:///docs/exports/export-1/People.csv');
    expect(written().body).toBe(spreadsheetSafeExport(csv, 'csv').body);
    expect(written().body).not.toBe(csv);
  });

  it('leaves the source of other languages untouched', async () => {
    const code = '=notAFormula()';
    const [option] = artifactExportOptions({ type: 'code', language: 'python' });
    await exportArtifact(code, 'script', option!);
    expect(written()).toEqual({ uri: 'file:///docs/exports/export-1/script.py', body: code });
  });

  it('saves a Dockerfile under its whole name, with no extension added', async () => {
    const [option] = artifactExportOptions({ type: 'code', language: 'dockerfile' });
    expect(option).toMatchObject({ label: 'Dockerfile', extension: '', fileName: 'Dockerfile' });

    await exportArtifact('FROM node:22\n', 'Build image', option!);

    expect(written().uri).toBe('file:///docs/exports/export-1/Dockerfile');
  });

  it('keeps an empty extension empty when a code block is saved', async () => {
    await exportSourceFile('all:\n\techo hi\n', 'Makefile', '');
    expect(written().uri).toBe('file:///docs/exports/export-1/Makefile');
  });

  it('names source files from the shared code file names, keeping .mmd for diagrams', () => {
    expect(artifactSourceExtension('kotlin')).toBe('kt');
    expect(artifactSourceExtension('rust')).toBe('rs');
    expect(artifactSourceExtension('mermaid')).toBe('mmd');
    expect(artifactSourceExtension(undefined)).toBe('txt');
  });
});

describe('file names', () => {
  it('keeps accents, spaces and non-Latin letters in an exported title', async () => {
    const report = await exportToMarkdown('# Plan', 'Résumé 2026');
    const quarterly = await exportToText('body', '季度报告');

    expect(report.fileName).toBe('Résumé 2026.md');
    expect(quarterly.fileName).toBe('季度报告.txt');
    expect(report.uri).toBe(
      `file:///docs/exports/export-1/${encodeURIComponent('Résumé 2026.md')}`,
    );
    expect(decodeURIComponent(quarterly.uri.split('/').pop()!)).toBe('季度报告.txt');
  });

  it('replaces only reserved characters, exactly as the shared file name rule does', async () => {
    const result = await exportToText('body', 'Q3: "draft" <v2>?');
    expect(result.fileName).toBe(`${sanitizeFilename('Q3: "draft" <v2>?')}.txt`);
    expect(result.fileName).toBe('Q3_ _draft_ _v2_.txt');
  });

  it('cannot leave its export folder through a title that looks like a path', async () => {
    const result = await exportToText('body', '../../Library/Preferences');
    expect(result.fileName).toBe('Preferences.txt');
    expect(result.uri).toBe('file:///docs/exports/export-1/Preferences.txt');
  });

  it('keeps a hash or percent sign in the name instead of reading it as part of the address', async () => {
    const result = await exportToText('body', 'Week #3 at 50%');
    expect(result.fileName).toBe('Week #3 at 50%.txt');
    expect(result.uri).toBe('file:///docs/exports/export-1/Week%20%233%20at%2050%25.txt');
  });

  it('saves downloaded files under the name the server gave them', async () => {
    respond('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const file = await downloadGeneratedFileAsManagedFile(
      'https://agiworkforce.com/api/files/gf-1',
      '季度报告.xlsx',
    );
    expect(file.name).toBe('季度报告.xlsx');

    respond('text/markdown');
    const notes = await downloadGeneratedFileAsManagedFile(
      'https://agiworkforce.com/api/files/gf-2',
      'Notes été.md',
    );
    expect(notes.name).toBe('Notes été.md');
    expect(decodeURIComponent(notes.uri.split('/').pop()!)).toBe('Notes été.md');
  });
});

describe('downloaded files', () => {
  it('gives a name without an extension the type the server sent', async () => {
    respond('text/csv');
    const uri = await downloadGeneratedFile('https://agiworkforce.com/api/files/gf-1', 'data');
    expect(uri).toBe('file:///docs/exports/export-1/data.csv');
  });

  it('keeps a name whose extension is already a known type', async () => {
    respond('text/plain');
    const uri = await downloadGeneratedFile('https://agiworkforce.com/api/files/gf-1', 'notes.md');
    expect(uri).toBe('file:///docs/exports/export-1/notes.md');
  });

  it('says a deleted file no longer exists and a signed-out download needs sign in', async () => {
    mockGuardedFetch.mockResolvedValue({ ok: false, status: 404, blob: async () => ({}) });
    const gone = await downloadGeneratedFile(
      'https://agiworkforce.com/api/files/gf-1',
      'report.pdf',
    ).catch((error: unknown) => error);
    expect(gone).toBeInstanceOf(FileDownloadError);
    expect(downloadFailureMessage(gone, FALLBACK)).toBe('This file no longer exists.');

    mockGuardedFetch.mockResolvedValue({ ok: false, status: 401, blob: async () => ({}) });
    const signedOut = await downloadGeneratedFile(
      'https://agiworkforce.com/api/files/gf-1',
      'report.pdf',
    ).catch((error: unknown) => error);
    expect(downloadFailureMessage(signedOut, FALLBACK)).toBe(
      'You must be signed in to download this file.',
    );
  });

  it('keeps Try again for failures that can pass on a retry', async () => {
    mockGuardedFetch.mockResolvedValue({ ok: false, status: 503, blob: async () => ({}) });
    const error = await downloadGeneratedFile(
      'https://agiworkforce.com/api/files/gf-1',
      'report.pdf',
    ).catch((caught: unknown) => caught);
    expect(downloadFailureMessage(error, FALLBACK)).toBe(FALLBACK);
    expect(downloadFailureMessage(new Error('boom'), FALLBACK)).toBe(FALLBACK);
  });
});

describe('stored GIF, AVIF and HEIC images', () => {
  it.each([
    ['image/gif', 'gif'],
    ['image/avif', 'avif'],
    ['image/heic', 'heic'],
  ])('shares %s with its own extension and type', async (mimeType, extension) => {
    respond(mimeType);
    await shareGeneratedImage('/api/files/22222222-2222-4222-8222-222222222222', 'party');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///docs/exports/export-1/party.${extension}`,
      expect.objectContaining({ mimeType }),
    );
  });

  it('saves a GIF to Photos and copies it', async () => {
    respond('image/gif');
    await saveGeneratedImageToPhotos('/api/files/22222222-2222-4222-8222-222222222222', 'party');
    expect(mockSaveToLibrary).toHaveBeenCalledWith('file:///docs/exports/export-1/party.gif');

    await copyGeneratedImage('/api/files/22222222-2222-4222-8222-222222222222');
    expect(mockSetImage).toHaveBeenCalledWith('R0lGODlh');
  });

  it('shares a .heic file with the HEIC type', async () => {
    await shareFile('file:///docs/exports/export-1/photo.heic');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///docs/exports/export-1/photo.heic', {
      UTI: 'public.heic',
      mimeType: 'image/heic',
    });
  });

  it('names a Photos refusal so the viewer can offer Settings', async () => {
    mockPhotoPermission.mockResolvedValue({ granted: false });
    await expect(
      saveGeneratedImageToPhotos('/api/files/22222222-2222-4222-8222-222222222222'),
    ).rejects.toBeInstanceOf(PhotosPermissionError);
    expect(mockGuardedFetch).not.toHaveBeenCalled();
  });
});
