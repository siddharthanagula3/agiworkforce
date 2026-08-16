
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

import * as Sharing from 'expo-sharing';
import { downloadGeneratedFile, shareGeneratedImage } from '@/services/fileCreation';

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
      headers: { get: () => 'image/png' },
      blob: async () => ({}),
    });
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
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

  it('materializes an owner-scoped image to a local file before opening the share sheet', async () => {
    const imagePath = '/api/files/22222222-2222-4222-8222-222222222222';

    await shareGeneratedImage(imagePath);

    expect(mockGuardedFetch).toHaveBeenCalledWith(
      'https://agiworkforce.com/api/files/22222222-2222-4222-8222-222222222222',
      { headers: { Authorization: 'Bearer test-jwt' } },
    );
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/exports/generated-image.png',
      'JVBERi0xLjc=',
      { encoding: 'base64' },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///docs/exports/generated-image.png', {
      mimeType: 'image/png',
      dialogTitle: 'Share generated image',
    });
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
      `file:///docs/exports/generated-image.${extension}`,
      'JVBERi0xLjc=',
      { encoding: 'base64' },
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///docs/exports/generated-image.${extension}`,
      expect.objectContaining({ mimeType }),
    );
  });
});
