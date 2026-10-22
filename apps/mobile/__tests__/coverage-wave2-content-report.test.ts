const mockStorage = new Map<string, string>();
let mockFailNextStorageWrite = false;

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      if (mockFailNextStorageWrite) {
        mockFailNextStorageWrite = false;
        throw new Error('private storage failure');
      }
      mockStorage.set(key, value);
    },
    delete: (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

const mockApiPost = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

import NetInfo from '@react-native-community/netinfo';
import { Linking } from 'react-native';
import {
  saveContentReport,
  getContentReports,
  clearContentReports,
  flushQueuedContentReports,
  openSupportEmail,
  queuedContentReports,
  sendStoredContentReport,
  type ContentReport,
  type ReportCategory,
} from '../services/contentReport';
import { reportAssetFor } from '../services/contentReportAsset';

const MAX_EXCERPT_LEN = 500;
const MAX_STORED_REPORTS = 100;
const MMKV_KEY = 'content-reports:v1';

function makeParams(
  overrides: Partial<{
    messageId: string;
    conversationId: string;
    contentExcerpt: string;
    category: ReportCategory;
    userNote: string;
    sendEmail: boolean;
  }> = {},
) {
  return {
    messageId: 'msg-001',
    conversationId: 'conv-001',
    contentExcerpt: 'This is an AI-generated excerpt.',
    category: 'inaccurate' as ReportCategory,
    userNote: 'The model made up a citation.',
    sendEmail: false,
    ...overrides,
  };
}

let canOpenSpy: jest.SpyInstance;
let openUrlSpy: jest.SpyInstance;

beforeEach(() => {
  mockStorage.clear();
  mockFailNextStorageWrite = false;
  mockApiPost.mockReset();
  mockApiPost.mockRejectedValue(new Error('offline'));
  canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => {
  canOpenSpy.mockRestore();
  openUrlSpy.mockRestore();
});

describe('saveContentReport, persistence', () => {
  it('persists a report to MMKV and returns the saved record', async () => {
    const { report, delivery } = await saveContentReport(makeParams());

    expect(report.messageId).toBe('msg-001');
    expect(report.conversationId).toBe('conv-001');
    expect(report.category).toBe('inaccurate');
    expect(report.emailHandoffOpened).toBe(false);
    expect(report.id).toMatch(/^rpt_/);
    expect(report.createdAt).toBeTruthy();
    expect(delivery).toEqual({ kind: 'stored-on-device' });
  });

  it('stores the report in MMKV so getContentReports returns it', async () => {
    await saveContentReport(makeParams({ messageId: 'msg-read-back' }));

    const reports = getContentReports();
    expect(reports.length).toBe(1);
    expect(reports[0]?.messageId).toBe('msg-read-back');
  });

  it('prepends new reports, most recent is at index 0', async () => {
    await saveContentReport(makeParams({ messageId: 'first' }));
    await saveContentReport(makeParams({ messageId: 'second' }));

    const reports = getContentReports();
    expect(reports[0]?.messageId).toBe('second');
    expect(reports[1]?.messageId).toBe('first');
  });
});

describe('saveContentReport, contentExcerpt truncation', () => {
  it('truncates contentExcerpt to 500 characters', async () => {
    const longExcerpt = 'X'.repeat(MAX_EXCERPT_LEN + 100);
    const { report } = await saveContentReport(makeParams({ contentExcerpt: longExcerpt }));

    expect(report.contentExcerpt.length).toBe(MAX_EXCERPT_LEN);
  });

  it('does not truncate excerpts within the 500-char limit', async () => {
    const shortExcerpt = 'Short excerpt.';
    const { report } = await saveContentReport(makeParams({ contentExcerpt: shortExcerpt }));

    expect(report.contentExcerpt).toBe(shortExcerpt);
  });
});

describe('saveContentReport, MAX_STORED_REPORTS cap (100)', () => {
  it('evicts the oldest report when the 101st is saved', async () => {
    for (let i = 0; i < MAX_STORED_REPORTS; i++) {
      await saveContentReport(makeParams({ messageId: String(i) }));
    }

    expect(getContentReports().length).toBe(MAX_STORED_REPORTS);

    await saveContentReport(makeParams({ messageId: '100' }));

    const reports = getContentReports();
    expect(reports.length).toBe(MAX_STORED_REPORTS);

    expect(reports[0]?.messageId).toBe('100');

    const ids = reports.map((r: ContentReport) => r.messageId);
    expect(ids).not.toContain('0');
  });
});

describe('getContentReports', () => {
  it('returns empty array when no reports have been saved', () => {
    expect(getContentReports()).toEqual([]);
  });

  it('returns empty array when MMKV key is absent', () => {
    mockStorage.delete(MMKV_KEY);
    expect(getContentReports()).toEqual([]);
  });

  it('returns empty array and does not throw when MMKV contains corrupt JSON', () => {
    mockStorage.set(MMKV_KEY, '[[broken json');
    expect(() => getContentReports()).not.toThrow();
    expect(getContentReports()).toEqual([]);
  });
});

describe('clearContentReports', () => {
  it('removes all stored reports from MMKV', async () => {
    await saveContentReport(makeParams());
    await saveContentReport(makeParams({ messageId: 'msg-002' }));

    clearContentReports();

    expect(getContentReports()).toEqual([]);
    expect(mockStorage.has(MMKV_KEY)).toBe(false);
  });

  it('does not throw when there are no reports to clear', () => {
    expect(() => clearContentReports()).not.toThrow();
  });
});

describe('saveContentReport, sendEmail=true', () => {
  it('calls Linking.openURL with a mailto: URL targeting support address', async () => {
    await saveContentReport(
      makeParams({ sendEmail: true, category: 'harmful', messageId: 'msg-email' }),
    );

    expect(openUrlSpy).toHaveBeenCalledTimes(1);
    const calledUrl: string = openUrlSpy.mock.calls[0][0] as string;
    expect(calledUrl.startsWith('mailto:contact@agiworkforce.com')).toBe(true);
    expect(calledUrl).toContain('subject=');
    expect(calledUrl).toContain('body=');
  });

  it('records the hand-off only once the mail client actually opened', async () => {
    const { report, delivery } = await saveContentReport(makeParams({ sendEmail: true }));
    expect(report.emailHandoffOpened).toBe(true);
    expect(delivery).toEqual({ kind: 'email-composer-opened' });
    expect(getContentReports()[0]?.emailHandoffOpened).toBe(true);
  });

  it('still saves the report, and does not claim a hand-off, when openURL rejects', async () => {
    openUrlSpy.mockRejectedValueOnce(new Error('no mail client'));

    const { report, delivery } = await saveContentReport(makeParams({ sendEmail: true }));

    expect(report.emailHandoffOpened).toBe(false);
    expect(delivery).toEqual({ kind: 'email-unavailable' });
    expect(getContentReports().length).toBe(1);
    expect(getContentReports()[0]?.emailHandoffOpened).toBe(false);
  });

  it('does not call Linking.openURL when canOpenURL returns false', async () => {
    canOpenSpy.mockResolvedValueOnce(false);

    const { delivery } = await saveContentReport(makeParams({ sendEmail: true }));

    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(delivery).toEqual({ kind: 'email-unavailable' });
  });
});

describe('saveContentReport, sendEmail=false', () => {
  it('does not call Linking.openURL', async () => {
    await saveContentReport(makeParams({ sendEmail: false }));
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('sets emailHandoffOpened=false on the saved record', async () => {
    const { report } = await saveContentReport(makeParams({ sendEmail: false }));
    expect(report.emailHandoffOpened).toBe(false);
  });
});

describe('saveContentReport, server intake', () => {
  it('POSTs the report to the intake route with the mobile-generated report id', async () => {
    mockApiPost.mockResolvedValueOnce({ success: true });

    const { report, delivery } = await saveContentReport(
      makeParams({ messageId: 'msg-x', conversationId: 'conv-x', category: 'harmful' }),
    );

    expect(mockApiPost).toHaveBeenCalledWith('/api/mobile/content-report', {
      reportId: report.id,
      messageId: 'msg-x',
      conversationId: 'conv-x',
      category: 'harmful',
      contentExcerpt: report.contentExcerpt,
      userNote: report.userNote,
    });
    expect(delivery).toEqual({ kind: 'submitted-to-server' });
    expect(report.serverAcknowledged).toBe(true);
    expect(getContentReports()[0]?.serverAcknowledged).toBe(true);
  });

  it('falls back to on-device storage when the server POST fails (offline / Local Mode)', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('EgressBlocked'));

    const { report, delivery } = await saveContentReport(makeParams({ sendEmail: false }));

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(delivery).toEqual({ kind: 'stored-on-device' });
    expect(report.serverAcknowledged).toBe(false);
    expect(getContentReports().length).toBe(1);
    expect(getContentReports()[0]?.serverAcknowledged).toBe(false);
  });

  it('reports submitted-to-server even if the optional email hand-off has no mail client', async () => {
    mockApiPost.mockResolvedValueOnce({ success: true });
    canOpenSpy.mockResolvedValueOnce(false);

    const { delivery } = await saveContentReport(makeParams({ sendEmail: true }));

    expect(delivery).toEqual({ kind: 'submitted-to-server' });
  });

  it('keeps the accepted report and optional email hand-off when local acknowledgment storage fails', async () => {
    mockApiPost.mockImplementationOnce(async () => {
      mockFailNextStorageWrite = true;
      return { success: true };
    });

    const { report, delivery } = await saveContentReport(makeParams({ sendEmail: true }));

    expect(report.serverAcknowledged).toBe(true);
    expect(delivery).toEqual({ kind: 'email-composer-opened' });
    expect(openUrlSpy).toHaveBeenCalledTimes(1);
  });

  it('never throws out of saveContentReport when the server POST rejects', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('boom'));
    await expect(saveContentReport(makeParams())).resolves.toBeDefined();
  });
});

describe('openSupportEmail', () => {
  it('opens the mail client for an already-stored report and marks the record', async () => {
    const { report } = await saveContentReport(makeParams({ sendEmail: false }));

    await expect(openSupportEmail(report)).resolves.toBe(true);

    const calledUrl: string = openUrlSpy.mock.calls[0][0] as string;
    expect(calledUrl.startsWith('mailto:contact@agiworkforce.com')).toBe(true);
    expect(getContentReports()[0]?.emailHandoffOpened).toBe(true);
  });

  it('returns false and leaves the record untouched when no mail client exists', async () => {
    const { report } = await saveContentReport(makeParams({ sendEmail: false }));
    canOpenSpy.mockResolvedValueOnce(false);

    await expect(openSupportEmail(report)).resolves.toBe(false);

    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(getContentReports()[0]?.emailHandoffOpened).toBe(false);
  });

  it('reports that the mail client opened even when local hand-off metadata cannot be saved', async () => {
    const { report } = await saveContentReport(makeParams({ sendEmail: false }));
    mockFailNextStorageWrite = true;

    await expect(openSupportEmail(report)).resolves.toBe(true);
    expect(openUrlSpy).toHaveBeenCalledTimes(1);
  });
});

describe('saveContentReport, media and shared content', () => {
  it('sends the image reference with a report on an image-only reply', async () => {
    mockApiPost.mockResolvedValueOnce({ success: true });

    const { report } = await saveContentReport({
      ...makeParams({ contentExcerpt: '' }),
      asset: { kind: 'image', url: 'https://cdn.example.com/img.png' },
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/mobile/content-report',
      expect.objectContaining({
        reportId: report.id,
        asset: { kind: 'image', url: 'https://cdn.example.com/img.png' },
      }),
    );
  });

  it('sends the shared item and its sharer with a report on shared content', async () => {
    mockApiPost.mockResolvedValueOnce({ success: true });

    await saveContentReport({
      ...makeParams({ messageId: 'p-1', conversationId: 'shared:project' }),
      sharedItem: { kind: 'project', id: 'p-1', sharerId: 'owner-1' },
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/mobile/content-report',
      expect.objectContaining({
        messageId: 'p-1',
        sharedItem: { kind: 'project', id: 'p-1', sharerId: 'owner-1' },
      }),
    );
  });

  it('keeps inline media bytes out of the asset reference', () => {
    expect(reportAssetFor('image', 'data:image/png;base64,AAAA')).toEqual({
      kind: 'image',
      url: 'data:image/png;base64',
    });
    expect(reportAssetFor('video', null)).toBeUndefined();
  });
});

describe('sendStoredContentReport, consented queue', () => {
  it('does not queue or resend a report the user has not agreed to send', async () => {
    await saveContentReport(makeParams());
    mockApiPost.mockReset();
    mockApiPost.mockResolvedValue({ success: true });

    expect(queuedContentReports()).toEqual([]);
    await expect(flushQueuedContentReports()).resolves.toBe(0);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('sends a stored report once the user agrees, marked as consented', async () => {
    const { report } = await saveContentReport(makeParams());
    expect(mockApiPost).toHaveBeenLastCalledWith(
      '/api/mobile/content-report',
      expect.objectContaining({ reportId: report.id }),
    );
    mockApiPost.mockResolvedValueOnce({ success: true });

    await expect(sendStoredContentReport(report.id)).resolves.toEqual({
      kind: 'submitted-to-server',
    });
    expect(mockApiPost).toHaveBeenLastCalledWith(
      '/api/mobile/content-report',
      expect.objectContaining({ reportId: report.id }),
      { consentedReport: true },
    );
    expect(getContentReports()[0]).toMatchObject({
      uploadConsented: true,
      serverAcknowledged: true,
    });
  });

  it('queues an agreed report while offline and sends it when the device reconnects', async () => {
    const addListener = NetInfo.addEventListener as jest.Mock;
    addListener.mockClear();
    const { report } = await saveContentReport(makeParams());

    await expect(sendStoredContentReport(report.id)).resolves.toEqual({
      kind: 'queued-for-upload',
    });
    expect(queuedContentReports().map((entry) => entry.id)).toEqual([report.id]);
    expect(addListener).toHaveBeenCalledTimes(1);

    mockApiPost.mockResolvedValueOnce({ success: true });
    const onChange = addListener.mock.calls[0]?.[0] as (state: { isConnected: boolean }) => void;
    onChange({ isConnected: true });

    await waitForQueueToDrain();
    expect(mockApiPost).toHaveBeenLastCalledWith(
      '/api/mobile/content-report',
      expect.objectContaining({ reportId: report.id }),
      { consentedReport: true },
    );
    expect(getContentReports()[0]?.serverAcknowledged).toBe(true);
  });

  it('rejects when the report is no longer on the device', async () => {
    await expect(sendStoredContentReport('rpt_missing')).rejects.toThrow();
  });
});

async function waitForQueueToDrain(): Promise<void> {
  for (let attempt = 0; attempt < 20 && queuedContentReports().length > 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
