/**
 * coverage-wave2-content-report.test.ts
 *
 * Unit tests for apps/mobile/services/contentReport.ts.
 *
 * Exercises:
 *  - saveContentReport: MMKV persistence, contentExcerpt truncation at 500 chars
 *  - MAX_STORED_REPORTS (100) cap: oldest entry is evicted when limit exceeded
 *  - getContentReports: reads back the persisted array
 *  - clearContentReports: deletes the MMKV key
 *  - sendEmail=true: Linking.openURL called with a mailto: URL for support address
 *  - sendEmail=false: Linking.openURL NOT called
 *
 * Google Play GenAI policy requires this in-app flagging mechanism.
 */

// ---------------------------------------------------------------------------
// MMKV mock — same Map-backed pattern used across the test suite
// ---------------------------------------------------------------------------

const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    delete: (key: string) => {
      mockStorage.delete(key);
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports — jest-expo preset already stubs TurboModules so Linking works.
// We spy on Linking methods after import rather than re-mocking all of
// react-native (which triggers the TurboModule invariant).
// ---------------------------------------------------------------------------

import { Linking } from 'react-native';
import {
  saveContentReport,
  getContentReports,
  clearContentReports,
  type ContentReport,
  type ReportCategory,
} from '../services/contentReport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  canOpenSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => {
  canOpenSpy.mockRestore();
  openUrlSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// saveContentReport — basic persistence
// ---------------------------------------------------------------------------

describe('saveContentReport — persistence', () => {
  it('persists a report to MMKV and returns the saved record', async () => {
    const report = await saveContentReport(makeParams());

    expect(report.messageId).toBe('msg-001');
    expect(report.conversationId).toBe('conv-001');
    expect(report.category).toBe('inaccurate');
    expect(report.emailedToSupport).toBe(false);
    expect(report.id).toMatch(/^rpt_/);
    expect(report.createdAt).toBeTruthy();
  });

  it('stores the report in MMKV so getContentReports returns it', async () => {
    await saveContentReport(makeParams({ messageId: 'msg-read-back' }));

    const reports = getContentReports();
    expect(reports.length).toBe(1);
    expect(reports[0]?.messageId).toBe('msg-read-back');
  });

  it('prepends new reports — most recent is at index 0', async () => {
    await saveContentReport(makeParams({ messageId: 'first' }));
    await saveContentReport(makeParams({ messageId: 'second' }));

    const reports = getContentReports();
    expect(reports[0]?.messageId).toBe('second');
    expect(reports[1]?.messageId).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// saveContentReport — contentExcerpt truncation
// ---------------------------------------------------------------------------

describe('saveContentReport — contentExcerpt truncation', () => {
  it('truncates contentExcerpt to 500 characters', async () => {
    const longExcerpt = 'X'.repeat(MAX_EXCERPT_LEN + 100);
    const report = await saveContentReport(makeParams({ contentExcerpt: longExcerpt }));

    expect(report.contentExcerpt.length).toBe(MAX_EXCERPT_LEN);
  });

  it('does not truncate excerpts within the 500-char limit', async () => {
    const shortExcerpt = 'Short excerpt.';
    const report = await saveContentReport(makeParams({ contentExcerpt: shortExcerpt }));

    expect(report.contentExcerpt).toBe(shortExcerpt);
  });
});

// ---------------------------------------------------------------------------
// saveContentReport — MAX_STORED_REPORTS cap
// ---------------------------------------------------------------------------

describe('saveContentReport — MAX_STORED_REPORTS cap (100)', () => {
  it('evicts the oldest report when the 101st is saved', async () => {
    // Save 100 reports with distinguishable messageIds "0" through "99"
    for (let i = 0; i < MAX_STORED_REPORTS; i++) {
      await saveContentReport(makeParams({ messageId: String(i) }));
    }

    // Confirm 100 stored
    expect(getContentReports().length).toBe(MAX_STORED_REPORTS);

    // Save the 101st — should evict the oldest
    await saveContentReport(makeParams({ messageId: '100' }));

    const reports = getContentReports();
    expect(reports.length).toBe(MAX_STORED_REPORTS);

    // Newest is at index 0
    expect(reports[0]?.messageId).toBe('100');

    // Oldest ("0") must be gone — it was at position 99 before the 101st arrived
    const ids = reports.map((r: ContentReport) => r.messageId);
    expect(ids).not.toContain('0');
  });
});

// ---------------------------------------------------------------------------
// getContentReports
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// clearContentReports
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// sendEmail=true — Linking.openURL called with mailto: URL
// ---------------------------------------------------------------------------

describe('saveContentReport — sendEmail=true', () => {
  it('calls Linking.openURL with a mailto: URL targeting support address', async () => {
    await saveContentReport(
      makeParams({ sendEmail: true, category: 'harmful', messageId: 'msg-email' }),
    );

    expect(openUrlSpy).toHaveBeenCalledTimes(1);
    const calledUrl: string = openUrlSpy.mock.calls[0][0] as string;
    expect(calledUrl.startsWith('mailto:support@agiworkforce.com')).toBe(true);
    expect(calledUrl).toContain('subject=');
    expect(calledUrl).toContain('body=');
  });

  it('sets emailedToSupport=true on the saved record', async () => {
    const report = await saveContentReport(makeParams({ sendEmail: true }));
    expect(report.emailedToSupport).toBe(true);
  });

  it('still saves the report locally even when Linking.openURL rejects', async () => {
    openUrlSpy.mockRejectedValueOnce(new Error('no mail client'));

    const report = await saveContentReport(makeParams({ sendEmail: true }));

    // The service swallows the Linking error — report must still be persisted
    expect(report.emailedToSupport).toBe(true);
    expect(getContentReports().length).toBe(1);
  });

  it('does not call Linking.openURL when canOpenURL returns false', async () => {
    canOpenSpy.mockResolvedValueOnce(false);

    await saveContentReport(makeParams({ sendEmail: true }));

    expect(openUrlSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendEmail=false — Linking.openURL NOT called
// ---------------------------------------------------------------------------

describe('saveContentReport — sendEmail=false', () => {
  it('does not call Linking.openURL', async () => {
    await saveContentReport(makeParams({ sendEmail: false }));
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('sets emailedToSupport=false on the saved record', async () => {
    const report = await saveContentReport(makeParams({ sendEmail: false }));
    expect(report.emailedToSupport).toBe(false);
  });
});
