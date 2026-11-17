const mockRandomUUID = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
const mockWriteAsStringAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMoveAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
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
  exportSourceFile,
  exportToMarkdown,
  exportToPDF,
  exportToText,
  viewerFileCopy,
} from '@/services/fileCreation';
import { MAX_NATIVE_FILENAME_BYTES } from '@/services/nativeFileName';

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: unknown): void {
    this.result = 'data:application/pdf;base64,JVBERi0xLjc=';
    this.onload?.();
  }
}

const CJK_TITLE = '\u9577'.repeat(100);
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';

function bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function diskName(uri: string): string {
  return decodeURIComponent(uri.slice(uri.lastIndexOf('/') + 1));
}

describe('exported file names fit the phone file system', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let nextExportId = 0;
    mockRandomUUID.mockImplementation(() => `export-${++nextExportId}`);
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
  });

  it('bounds a long CJK title to the byte limit and keeps .pdf, the same in the path and the result', async () => {
    const result = await exportToPDF('body', CJK_TITLE);

    expect(result.fileName.endsWith('.pdf')).toBe(true);
    expect(bytes(result.fileName)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect(result.file.name).toBe(result.fileName);
    expect(diskName(result.uri)).toBe(result.fileName);
    expect(mockMoveAsync).toHaveBeenCalledWith({ from: 'file:///tmp/print.pdf', to: result.uri });
    expect(bytes(diskName(result.uri))).toBeLessThanOrEqual(255);
  });

  it('bounds the text, markdown and source exports the same way', async () => {
    const text = await exportToText('body', CJK_TITLE);
    const markdown = await exportToMarkdown('body', CJK_TITLE);
    const source = await exportSourceFile('body', CJK_TITLE, 'py');

    for (const [result, extension] of [
      [text, '.txt'],
      [markdown, '.md'],
      [source, '.py'],
    ] as const) {
      expect(result.fileName.endsWith(extension)).toBe(true);
      expect(bytes(result.fileName)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
      expect(diskName(result.uri)).toBe(result.fileName);
      expect(result.file.name).toBe(result.fileName);
    }
  });

  it('cuts an emoji title on whole characters so the path can be encoded', async () => {
    const result = await exportToText('body', '\u{1F600}'.repeat(80));

    expect([...result.fileName.slice(0, -'.txt'.length)].every((c) => c === '\u{1F600}')).toBe(
      true,
    );
    expect(bytes(result.fileName)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect(diskName(result.uri)).toBe(result.fileName);
  });

  it('drops a family emoji the cut would split', async () => {
    const result = await exportToMarkdown('body', `${'\u9577'.repeat(80)}${FAMILY}`);

    expect(result.fileName).toBe(`${'\u9577'.repeat(80)}.md`);
  });

  it('replaces a lone surrogate in a title instead of throwing', async () => {
    const result = await exportToText('body', 'abc\uD83Ddef');

    expect(result.fileName).toBe('abc_def.txt');
    expect(diskName(result.uri)).toBe('abc_def.txt');
  });

  it('leaves a short title alone', async () => {
    const result = await exportToText('body', 'Launch plan');
    expect(result.fileName).toBe('Launch plan.txt');
  });

  it('gives the fallback name when the title has nothing in it', async () => {
    expect((await exportToText('body', '')).fileName).toBe('file.txt');
    expect((await exportToText('body', '...')).fileName).toBe('file.txt');
  });
});

describe('downloaded file names fit the phone file system', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let nextExportId = 0;
    mockRandomUUID.mockImplementation(() => `export-${++nextExportId}`);
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/pdf' },
      blob: async () => ({}),
    });
  });

  it('keeps the extension of an incoming name with a long multibyte base', async () => {
    const file = await downloadGeneratedFileAsManagedFile(
      'https://agiworkforce.com/api/files/gf-1',
      `${CJK_TITLE}.pdf`,
    );

    expect(file.name.endsWith('.pdf')).toBe(true);
    expect(bytes(file.name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect(diskName(file.uri)).toBe(file.name);
  });

  it('adds the extension the server named and still fits', async () => {
    const file = await downloadGeneratedFileAsManagedFile(
      'https://agiworkforce.com/api/files/gf-1',
      CJK_TITLE,
    );

    expect(file.name.endsWith('.pdf')).toBe(true);
    expect(bytes(file.name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
    expect(diskName(file.uri)).toBe(file.name);
  });

  it('bounds the name of a copy made to view a file', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    const uri = await viewerFileCopy('https://agiworkforce.com/api/files/gf-9', `${CJK_TITLE}.pdf`);

    const name = diskName(uri);
    expect(name.endsWith('.pdf')).toBe(true);
    expect(bytes(name)).toBeLessThanOrEqual(MAX_NATIVE_FILENAME_BYTES);
  });
});
