const mockRandomUUID = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
const mockWriteAsStringAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMoveAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  moveAsync: (...args: unknown[]) => mockMoveAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///tmp/print.pdf' })),
}));

const mockGuardedFetch = jest.fn();
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
  isOurCloudHost: (host: string) =>
    host === 'agiworkforce.com' || host.endsWith('.agiworkforce.com'),
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer test-jwt' })),
}));

import {
  downloadGeneratedFileAsManagedFile,
  exportToMarkdown,
  exportToPDF,
  exportToText,
} from '@/services/fileCreation';

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: unknown): void {
    this.result = 'data:application/pdf;base64,JVBERi0xLjc=';
    this.onload?.();
  }
}

describe('mobile exports speak the shared File model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let nextExportId = 0;
    mockRandomUUID.mockImplementation(() => `export-${++nextExportId}`);
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
  });

  it('describes a text export as a local-device file at version 1', async () => {
    const result = await exportToText('hello there', 'Launch plan');

    expect(result.file.uri).toBe(result.uri);
    expect(result.file.name).toBe('Launch_plan.txt');
    expect(result.file.mediaType).toBe('text/plain');
    expect(result.file.storage).toBe('local_device');
    expect(result.file.origin).toBe('generated');
    expect(result.file.sourceSurface).toBe('mobile');
    expect(result.file.version).toBe(1);
    expect(result.file.parentVersionId).toBeNull();
  });

  it('records the conversation an export was taken from', async () => {
    const result = await exportToMarkdown('body', 'Notes', { conversationId: 'conv-7' });
    expect(result.file.lineage.conversationId).toBe('conv-7');
    expect(result.file.mediaType).toBe('text/markdown');
  });

  it('gives a pdf export the pdf media type', async () => {
    const result = await exportToPDF('body', 'Notes');
    expect(result.file.mediaType).toBe('application/pdf');
    expect(result.uri).toBe('file:///docs/exports/export-1/Notes.pdf');
  });

  it('links a downloaded cloud file back to the asset it was copied from', async () => {
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => ({}),
    });

    const file = await downloadGeneratedFileAsManagedFile(
      'https://agiworkforce.com/api/files/gf-1',
      'report.pdf',
    );

    expect(file.lineage.derivedFromFileId).toBe('gf-1');
    expect(file.lineage.derivation).toBe('copy');
    expect(file.uri).toBe('file:///docs/exports/export-1/report.pdf');
  });

  it('preserves same-title exports in separate directories with the same display name', async () => {
    const [first, second] = await Promise.all([
      exportToText('first contents', 'Notes'),
      exportToText('second contents', 'Notes'),
    ]);
    expect(first.uri).not.toBe(second.uri);
    expect(first.fileName).toBe('Notes.txt');
    expect(second.fileName).toBe('Notes.txt');
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      first.uri,
      expect.stringContaining('first contents'),
      { encoding: 'utf8' },
    );
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      second.uri,
      expect.stringContaining('second contents'),
      { encoding: 'utf8' },
    );
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('does not delete a prior PDF when exporting another with the same title', async () => {
    const first = await exportToPDF('first', 'Notes');
    const second = await exportToPDF('second', 'Notes');
    expect(first.uri).not.toBe(second.uri);
    expect(mockMoveAsync).toHaveBeenCalledWith({ from: 'file:///tmp/print.pdf', to: second.uri });
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('refuses an already-existing allocated directory without overwriting or deleting', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    await expect(exportToText('body', 'Notes')).rejects.toThrow(/allocate/);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockMakeDirectoryAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('propagates directory allocation failure without falling back to a shared filename', async () => {
    const failure = new Error('disk full');
    mockGetInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === 'file:///docs/exports/',
    }));
    mockMakeDirectoryAsync.mockRejectedValueOnce(failure);
    await expect(exportToText('body', 'Notes')).rejects.toBe(failure);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

});
