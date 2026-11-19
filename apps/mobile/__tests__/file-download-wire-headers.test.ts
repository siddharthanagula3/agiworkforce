const mockRandomUUID = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readDirectoryAsync: jest.fn(async () => []),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({ setImageAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn(() => ({ session: null })) }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { refresh: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: { getState: () => ({ appMode: 'cloud' }) },
}));
jest.mock('@/services/providerConsent', () => ({
  hasCurrentCloudProviderConsent: () => true,
}));
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer test-jwt' })),
}));

import { CLIENT_CAPABILITIES_REQUEST_HEADER } from '@agiworkforce/cloud-contracts';
import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';
import { API_URL } from '@/lib/constants';
import { downloadGeneratedFile, viewerFileCopy } from '@/services/fileCreation';
import { setClerkTokenMinter } from '@/src/integrations/clerk';

class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  readAsDataURL(_blob: unknown): void {
    this.result = 'data:application/pdf;base64,JVBERi0xLjc=';
    this.onload?.();
  }
}

const mockNetworkFetch = jest.fn();
const originalFetch = global.fetch;

function headerNames(init: RequestInit | undefined): string[] {
  const headers = init?.headers;
  if (!headers) return [];
  if (headers instanceof Headers) return [...headers.keys()].map((name) => name.toLowerCase());
  const entries = Array.isArray(headers) ? headers : Object.entries(headers);
  return entries.map(([name]) => name.toLowerCase());
}

describe('the request a phone file download puts on the wire', () => {
  beforeEach(() => {
    let next = 0;
    mockRandomUUID.mockImplementation(() => `export-${++next}`);
    (globalThis as Record<string, unknown>).FileReader = FakeFileReader;
    setClerkTokenMinter(
      async (options?: { template?: string }) =>
        options?.template ? 'surface-token' : 'session-token',
      () => 'user-1',
    );
    mockNetworkFetch.mockReset().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      url,
      headers: { get: () => 'application/pdf' },
      blob: async () => ({}),
    }));
    (global as { fetch: unknown }).fetch = mockNetworkFetch;
  });

  afterEach(() => setClerkTokenMinter(null, null));

  afterAll(() => {
    (global as { fetch: unknown }).fetch = originalFetch;
  });

  it('carries sign-in and surface proof but never announces the large-file capability', async () => {
    await downloadGeneratedFile(`${API_URL}/api/files/gf-1`, 'report.pdf');
    await viewerFileCopy(`${API_URL}/api/files/gf-2`, 'report.pdf');

    expect(mockNetworkFetch).toHaveBeenCalledTimes(2);
    for (const [, init] of mockNetworkFetch.mock.calls as [string, RequestInit | undefined][]) {
      const names = headerNames(init);
      expect(names).toEqual(
        expect.arrayContaining(['authorization', SURFACE_TOKEN_HEADER.toLowerCase()]),
      );
      expect(names).not.toContain(CLIENT_CAPABILITIES_REQUEST_HEADER.toLowerCase());
    }
  });
});
