import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
} from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query }) }));

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import {
  CONSENT_PURPOSES,
  CURRENT_NOTICE_VERSION,
  noticeVersionForPurpose,
  recordConsent,
} from './consent-records';

const OTHER_PURPOSES = CONSENT_PURPOSES.map((purpose) => purpose.id).filter(
  (id) => id !== PRODUCT_ANALYTICS_CONSENT_PURPOSE,
);

describe('noticeVersionForPurpose', () => {
  it('names the analytics disclosure for product analytics, never a privacy date', () => {
    expect(noticeVersionForPurpose(PRODUCT_ANALYTICS_CONSENT_PURPOSE)).toBe(
      PRODUCT_ANALYTICS_NOTICE_VERSION,
    );
    expect(noticeVersionForPurpose(PRODUCT_ANALYTICS_CONSENT_PURPOSE)).not.toBe(
      POLICY_LAST_UPDATED.privacy,
    );
  });

  it('names the privacy notice for every other purpose', () => {
    expect(OTHER_PURPOSES.length).toBeGreaterThan(0);
    for (const purpose of OTHER_PURPOSES) {
      expect(noticeVersionForPurpose(purpose)).toBe(CURRENT_NOTICE_VERSION);
    }
  });
});

describe('recordConsent', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (_sql: string, params: unknown[]) => [
      {
        purpose: params[2],
        granted: params[3],
        notice_version: params[4],
        surface: params[5],
        recorded_at: '2026-09-29T00:00:00.000Z',
      },
    ]);
  });

  it('writes the analytics identifier on a product analytics grant', async () => {
    const record = await recordConsent({
      subject: { kind: 'user', userId: 'user_1' },
      purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE,
      granted: true,
      surface: 'web-settings',
    });

    expect(record.noticeVersion).toBe(PRODUCT_ANALYTICS_NOTICE_VERSION);
  });
});
