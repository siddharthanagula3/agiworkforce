const mockGetInfoAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
let mockUuid = 0;

jest.mock('expo-crypto', () => ({ randomUUID: () => `export-${++mockUuid}` }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  moveAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-media-library/legacy', () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));
jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({})),
}));

import { EXPORTS_DIR, exportToText, removeStaleExports } from '@/services/fileCreation';

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const HOUR_S = 60 * 60;
const NOW_S = NOW / 1000;

const AGES_S: Record<string, number> = {
  'shared-two-days-ago': 48 * HOUR_S,
  'shared-yesterday-evening': 25 * HOUR_S,
  'shared-this-morning': 3 * HOUR_S,
  'shared-a-minute-ago': 60,
};

let madeThisSession: string[] = [];

function exportFolderName(uri: string): string {
  return uri.slice(EXPORTS_DIR.length).replace(/\/$/, '');
}

beforeEach(() => {
  jest.clearAllMocks();
  madeThisSession = [];
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockReadDirectoryAsync.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return [...Object.keys(AGES_S), ...madeThisSession];
  });
  mockGetInfoAsync.mockImplementation(async (uri: string) => {
    if (uri === EXPORTS_DIR) return { exists: true, isDirectory: true };
    const entry = exportFolderName(uri);
    if (madeThisSession.includes(entry)) {
      return { exists: true, isDirectory: true, modificationTime: NOW_S };
    }
    const age = AGES_S[entry];
    return age === undefined
      ? { exists: false, isDirectory: false }
      : { exists: true, isDirectory: true, modificationTime: NOW_S - age };
  });
  mockDeleteAsync.mockResolvedValue(undefined);
  mockMakeDirectoryAsync.mockImplementation(async (uri: string) => {
    if (uri.startsWith(EXPORTS_DIR) && uri !== EXPORTS_DIR)
      madeThisSession.push(exportFolderName(uri));
  });
  mockWriteAsStringAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the exports folder', () => {
  it('lives in the cache, which is never backed up', () => {
    expect(EXPORTS_DIR).toBe('file:///cache/exports/');
  });

  it('removes only the exports older than a day', async () => {
    await removeStaleExports();

    expect(mockDeleteAsync.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///cache/exports/shared-two-days-ago/',
      'file:///cache/exports/shared-yesterday-evening/',
    ]);
  });

  it('sweeps once, at the first export of a session, and keeps the file just written', async () => {
    const first = await exportToText('one', 'Notes');
    await exportToText('two', 'Notes');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(madeThisSession).toContain('export-1');
    expect(first.uri.startsWith('file:///cache/exports/export-1/')).toBe(true);
    expect(mockReadDirectoryAsync).toHaveBeenCalledTimes(1);
    expect(mockReadDirectoryAsync).toHaveBeenCalledWith('file:///cache/exports/');
    const deleted = mockDeleteAsync.mock.calls.map(([uri]) => String(uri));
    expect(deleted).toEqual([
      'file:///cache/exports/shared-two-days-ago/',
      'file:///cache/exports/shared-yesterday-evening/',
    ]);
    expect(deleted.some((uri) => first.uri.startsWith(uri))).toBe(false);
  });
});
