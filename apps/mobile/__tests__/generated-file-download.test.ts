/**
 * downloadGeneratedFile (services/fileCreation.ts) — the Cloud-mode
 * generated-file consumption leg on mobile.
 *
 * Pins: bytes are fetched through guardedFetch (Local-mode zero-leak
 * chokepoint), the Clerk Bearer token is attached ONLY for our-cloud hosts,
 * downloaded bytes land in the exports dir with the real extension, and HTTP
 * failures surface as honest errors (401 → sign-in message) instead of a
 * silent empty export.
 */

const mockWriteAsStringAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

const mockGuardedFetch = jest.fn();
jest.mock('@/lib/egressGuard', () => ({
  guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args),
  isOurCloudHost: (host: string) =>
    host === 'agiworkforce.com' || host.endsWith('.agiworkforce.com'),
}));

const mockGetAuthHeaders = jest.fn();
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: (...args: unknown[]) => mockGetAuthHeaders(...args),
}));

import { downloadGeneratedFile } from '@/services/fileCreation';

/** FileReader stand-in: resolves every blob to a fixed base64 data URL. */
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
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockGetAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test-jwt' });
    mockGuardedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => ({}),
    });
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
      'file:///docs/exports/report.pdf',
      'JVBERi0xLjc=',
      { encoding: 'base64' },
    );
    expect(uri).toBe('file:///docs/exports/report.pdf');
  });

  it('does NOT attach the Bearer token for non-our-cloud hosts (no JWT leak)', async () => {
    await downloadGeneratedFile('https://media.example/x.pdf', 'x.pdf');
    expect(mockGetAuthHeaders).not.toHaveBeenCalled();
    expect(mockGuardedFetch).toHaveBeenCalledWith('https://media.example/x.pdf', { headers: {} });
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

  it('surfaces other HTTP failures with the status code', async () => {
    mockGuardedFetch.mockResolvedValue({ ok: false, status: 503, blob: async () => ({}) });
    await expect(
      downloadGeneratedFile('https://agiworkforce.com/api/files/gf-1', 'report.pdf'),
    ).rejects.toThrow(/HTTP 503/);
  });
});
