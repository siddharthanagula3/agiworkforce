jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'cloud-export-id') }));
const mockApiGet = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockIsAvailableAsync = jest.fn();
const mockShareAsync = jest.fn();

jest.mock('../services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

import { exportCloudUserData } from '../services/cloudDataExport';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
} from '../src/features/auth/services/cloudAccountSession';

describe('Cloud account data export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockResolvedValue(undefined);
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        export_metadata: { user_id: 'account-a' },
        conversations: [{ id: 'conversation-1', title: 'My chat' }],
      },
    });
  });

  it('downloads, writes, shares, and removes the account-scoped JSON file', async () => {
    const account = captureCloudAccountEpoch();
    if (!account) throw new Error('Expected an active test account');

    await exportCloudUserData(account);

    expect(mockApiGet).toHaveBeenCalledWith('/api/user/export', {
      timeout: 120_000,
      accountEpoch: account,
    });
    expect(mockMakeDirectoryAsync).toHaveBeenCalledWith('file:///cache/dsar_exports/', {
      intermediates: true,
    });
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/dsar_exports/cloud-export-id/agi_cloud_data_export.json',
      expect.stringContaining('"conversations"'),
      { encoding: 'utf8' },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/dsar_exports/cloud-export-id/agi_cloud_data_export.json',
      {
        mimeType: 'application/json',
        dialogTitle: 'Save your AGI Cloud data export',
        UTI: 'public.json',
      },
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/dsar_exports/cloud-export-id/', {
      idempotent: true,
    });
  });

  it('does not write account A data after the active account changes', async () => {
    let resolveRequest!: (value: { success: boolean; data: Record<string, unknown> }) => void;
    mockApiGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const accountA = captureCloudAccountEpoch();
    if (!accountA) throw new Error('Expected account A');

    const exportPromise = exportCloudUserData(accountA);
    activateCloudAccount('account-b');
    resolveRequest({ success: true, data: { conversations: [] } });

    await expect(exportPromise).rejects.toThrow('Cloud account changed');
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
  it.each(['write', 'availability'])(
    'does not share after account changes during %s',
    async (boundary) => {
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      if (boundary === 'write') {
        mockWriteAsStringAsync.mockImplementationOnce(async () => {
          entered();
          await pending;
        });
      } else {
        mockIsAvailableAsync.mockImplementationOnce(async () => {
          entered();
          await pending;
          return true;
        });
      }
      const account = captureCloudAccountEpoch();
      if (!account) throw new Error('Expected account');
      const exporting = exportCloudUserData(account);
      const rejected = expect(exporting).rejects.toThrow('Cloud account changed');
      await started;
      activateCloudAccount('account-b');
      release();
      await rejected;
      expect(mockShareAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/dsar_exports/cloud-export-id/', {
        idempotent: true,
      });
    },
  );

  it('does not relabel accepted native sharing as stopped after account changes', async () => {
    mockShareAsync.mockImplementationOnce(async () => {
      activateCloudAccount('account-b');
    });
    const account = captureCloudAccountEpoch();
    if (!account) throw new Error('Expected account');
    await expect(exportCloudUserData(account)).resolves.toBeUndefined();
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });
});
