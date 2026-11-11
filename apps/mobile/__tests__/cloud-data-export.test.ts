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

import {
  CloudExportSharingUnavailableError,
  PartialCloudDataExportError,
  describePartialCloudDataExport,
  exportCloudUserData,
  shareCloudDataExport,
} from '../services/cloudDataExport';
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

describe('a partial Cloud account data export', () => {
  const completeness = {
    status: 'partial' as const,
    unavailable_sections: ['billing_invoices'],
    skipped_rows: [{ section: 'conversations', count: 2 }],
    truncated_sections: [{ section: 'security_audit_logs', limit: 1000 }],
    retry:
      'Request the export again for unavailable sections. Truncated sections contain only a limited subset of their rows; repeating this bounded export does not retrieve the omitted rows.',
  };
  const partialDocument = {
    export_metadata: { user_id: 'account-a', completeness },
    security_audit_logs: [{ id: 'log-1' }],
  };

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
    mockApiGet.mockResolvedValue({ success: false, status: 'partial', data: partialDocument });
  });

  function activeAccount() {
    const account = captureCloudAccountEpoch();
    if (!account) throw new Error('Expected an active test account');
    return account;
  }

  it('hands back what the server said is missing instead of a connection failure', async () => {
    const failure = await exportCloudUserData(activeAccount()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(PartialCloudDataExportError);
    expect((failure as PartialCloudDataExportError).completeness).toEqual(completeness);
    expect((failure as PartialCloudDataExportError).document).toEqual(partialDocument);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('names each kind of gap and says which ones another export cannot fill', () => {
    const description = describePartialCloudDataExport(completeness);

    expect(description).toContain('Not available right now: billing invoices.');
    expect(description).toContain(
      'Only the most recent 1,000 entries of security audit logs are included. Exporting again will not add the rest.',
    );
    expect(description).toContain('2 entries of conversations could not be exported');
    expect(description).toContain('Everything else in your account is included.');
    expect(description).not.toMatch(/connection/i);
  });

  it('saves a partial export only under a name that says it is partial', async () => {
    await shareCloudDataExport(activeAccount(), partialDocument, 'partial');

    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/dsar_exports/cloud-export-id/agi_cloud_data_export_partial.json',
      expect.stringContaining('"truncated_sections"'),
      { encoding: 'utf8' },
    );
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/dsar_exports/cloud-export-id/agi_cloud_data_export_partial.json',
      expect.objectContaining({ dialogTitle: 'Save your partial AGI Cloud data export' }),
    );
  });

  it('does not save account A’s partial export once account B is active', async () => {
    const account = activeAccount();
    activateCloudAccount('account-b');

    await expect(shareCloudDataExport(account, partialDocument, 'partial')).rejects.toThrow(
      'Cloud account changed',
    );
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('treats a partial status without a readable completeness record as invalid', async () => {
    mockApiGet.mockResolvedValue({
      success: false,
      status: 'partial',
      data: { export_metadata: { completeness: { status: 'partial' } } },
    });

    const failure = await exportCloudUserData(activeAccount()).catch((error: unknown) => error);

    expect(failure).not.toBeInstanceOf(PartialCloudDataExportError);
    expect((failure as Error).message).toBe('AGI Cloud returned an invalid data export.');
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('rejects a response whose data is not an export document', async () => {
    mockApiGet.mockResolvedValue({ success: true, status: 'complete', data: [] });

    await expect(exportCloudUserData(activeAccount())).rejects.toThrow(
      'AGI Cloud returned an invalid data export.',
    );
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('says sharing is unavailable rather than reporting a failed request', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      status: 'complete',
      data: { conversations: [] },
    });
    mockIsAvailableAsync.mockResolvedValue(false);

    await expect(exportCloudUserData(activeAccount())).rejects.toBeInstanceOf(
      CloudExportSharingUnavailableError,
    );
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});
