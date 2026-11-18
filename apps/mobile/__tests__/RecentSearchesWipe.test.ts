const mockAuthToken = jest.fn();
const mockClearAuthSession = jest.fn();
const mockSecureFetch = jest.fn();
const mockGetDeviceId = jest.fn();
const mockDeleteKeychainItem = jest.fn();
const mockExec = jest.fn();
const mockCloseDb = jest.fn();
const mockDeleteFile = jest.fn();
const mockClearCloudState = jest.fn();
const mockMarkers = new Map<string, string | boolean>();
const mockDeleteSetAsideStores = jest.fn();
const mockRemoveViewerFileCopies = jest.fn();
const mockDeleteSetAsideDatabases = jest.fn();
const mockClerkSetActive = jest.fn();
const mockClerkSignOut = jest.fn();
let mockClerkInstance: Record<string, unknown> | null = null;

jest.mock('@clerk/expo', () => ({ getClerkInstance: () => mockClerkInstance }));

jest.mock('../services/authSession', () => ({
  getAuthToken: () => mockAuthToken(),
  clearAuthSession: () => mockClearAuthSession(),
}));
jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: () => mockClearCloudState(),
}));
jest.mock('../services/secureFetch', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));
jest.mock('../lib/deviceId', () => ({ getDeviceId: () => mockGetDeviceId() }));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
  setItemAsync: jest.fn(),
  deleteItemAsync: (...args: unknown[]) => mockDeleteKeychainItem(...args),
}));
jest.mock('../lib/mmkv', () => ({
  storage: {
    getBoolean: (key: string) => mockMarkers.get(key),
    getString: (key: string) => mockMarkers.get(key),
    set: (key: string, value: string | boolean) => mockMarkers.set(key, value),
    delete: (key: string) => mockMarkers.delete(key),
    clearAll: () => mockMarkers.clear(),
  },
  deleteSetAsideStores: () => mockDeleteSetAsideStores(),
}));
jest.mock('../services/api', () => ({ api: { post: jest.fn(), delete: jest.fn() } }));
jest.mock('../src/features/billing/store', () => ({ useTierStore: { getState: jest.fn() } }));
jest.mock('../src/features/model-picker/store', () => ({ useModelStore: { getState: jest.fn() } }));
jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: {
    getState: () => ({ appMode: 'local' }),
    subscribe: () => () => {},
  },
}));
jest.mock('../src/features/chat/utils/newConversationModel', () => ({
  resolveNewConversationModel: jest.fn(),
}));
jest.mock('../storage/db', () => ({
  getDb: async () => ({
    withTransactionAsync: async (callback: () => Promise<void>) => callback(),
    execAsync: (...args: unknown[]) => mockExec(...args),
  }),
  closeDb: () => mockCloseDb(),
  deleteSetAsideDatabases: () => mockDeleteSetAsideDatabases(),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  deleteAsync: (...args: unknown[]) => mockDeleteFile(...args),
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));
jest.mock('../services/dsarTemporaryFile', () => ({ withDsarTemporaryFile: jest.fn() }));
const mockWithdrawSharing = jest.fn();
jest.mock('../src/features/settings/cloud-privacy/CloudProviderSharingGroup', () => ({
  withdrawSharingWithProviders: () => mockWithdrawSharing(),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('../storage/conversations', () => ({ listConversations: jest.fn() }));
jest.mock('../storage/messages', () => ({ getMessagesForConversation: jest.fn() }));
jest.mock('../storage/memory', () => ({ listMemoryFacts: jest.fn() }));
jest.mock('../storage/customInstructions', () => ({ listCustomInstructions: jest.fn() }));
jest.mock('../storage/settingsDb', () => ({ getAllSettings: jest.fn() }));
jest.mock('../storage/installedModels', () => ({ listInstalledModels: jest.fn() }));
jest.mock('../services/complianceLedger', () => ({
  mmkvDisclosureLedger: { read: jest.fn() },
  mmkvConsentLedger: { getNamedProviderConsent: jest.fn() },
}));
jest.mock('../services/fileCreation', () => ({
  EXPORTS_DIR: 'file:///documents/exports/',
  removeViewerFileCopies: () => mockRemoveViewerFileCopies(),
}));

import { wipeAllLocalData } from '../services/dsarExport';
import { useAuthStore } from '../src/features/auth/store';
import { __resetCloudAccountSessionForTests } from '../src/features/auth/services/cloudAccountSession';
import { readRecentSearches, recordRecentSearch } from '../src/features/search';

describe('delete all local data and recent searches', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    __resetCloudAccountSessionForTests();
    mockMarkers.clear();
    mockAuthToken.mockResolvedValue('captured-clerk-token');
    mockGetDeviceId.mockResolvedValue('old-install');
    mockSecureFetch.mockResolvedValue({ ok: true });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'account-a' });
    mockClerkInstance = null;
  });

  it('forgets the recent searches of Local and of every Cloud account', async () => {
    const cloud = { mode: 'cloud', ownerId: 'account-a' } as const;
    const local = { mode: 'local' } as const;
    recordRecentSearch(local, 'on device');
    recordRecentSearch(cloud, 'in the cloud');
    expect(readRecentSearches(local)).toEqual(['on device']);
    expect(readRecentSearches(cloud)).toEqual(['in the cloud']);

    await wipeAllLocalData();

    expect(readRecentSearches(local)).toEqual([]);
    expect(readRecentSearches(cloud)).toEqual([]);
  });
});
