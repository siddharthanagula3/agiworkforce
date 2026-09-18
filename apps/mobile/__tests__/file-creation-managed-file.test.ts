const mockWriteAsStringAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMoveAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: jest.fn(),
  moveAsync: (...args: unknown[]) => mockMoveAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  makeDirectoryAsync: jest.fn(),
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
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    mockGetInfoAsync.mockResolvedValue({ exists: false });
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
    expect(result.uri).toBe('file:///docs/exports/Notes.pdf');
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
    expect(file.uri).toBe('file:///docs/exports/report.pdf');
  });
});
