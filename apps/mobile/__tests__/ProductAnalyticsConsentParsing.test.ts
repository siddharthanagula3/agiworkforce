import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
} from '@agiworkforce/types';
import {
  parseProductAnalyticsChoice,
  parseProductAnalyticsReceipt,
} from '@/src/features/settings/cloud-privacy/productAnalyticsConsent';

const submissionVersion = '2026-10-01';
const decision = {
  purpose: PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  granted: true,
  noticeVersion: PRODUCT_ANALYTICS_NOTICE_VERSION,
};
const envelope = {
  noticeVersion: submissionVersion,
  purposes: [{ id: PRODUCT_ANALYTICS_CONSENT_PURPOSE }],
  consents: [decision],
};

describe('product analytics settings responses', () => {
  it('separates submission notice from the per-purpose grant version', () => {
    expect(parseProductAnalyticsChoice(envelope)).toEqual({
      granted: true, noticeVersion: submissionVersion,
    });
    expect(parseProductAnalyticsChoice({ ...envelope, consents: [] }).granted).toBe(false);
    expect(parseProductAnalyticsChoice({
      ...envelope, consents: [{ ...decision, noticeVersion: 'old-purpose-notice' }],
    }).granted).toBe(false);
  });

  it.each([
    null, [], {}, { ...envelope, noticeVersion: '' },
    { ...envelope, consents: null }, { ...envelope, consents: [{}] },
    { ...envelope, consents: [{ ...decision, granted: 'true' }] },
    { ...envelope, consents: [decision, decision] },
    { ...envelope, purposes: [] }, { ...envelope, purposes: ['product_analytics'] },
  ])('rejects malformed GET data rather than inventing an off choice: %p', (value) => {
    expect(() => parseProductAnalyticsChoice(value)).toThrow();
  });

  it('accepts the acknowledged denial when the server adjusts a requested grant', () => {
    expect(parseProductAnalyticsReceipt({
      noticeVersion: submissionVersion, recorded: [{ ...decision, granted: false }],
    }, { noticeVersion: submissionVersion, granted: true })).toEqual({
      noticeVersion: submissionVersion, granted: false,
    });
  });

  it.each([
    {}, { noticeVersion: submissionVersion, recorded: [] },
    { noticeVersion: 'another-notice', recorded: [decision] },
    { noticeVersion: submissionVersion, recorded: [decision, decision] },
    { noticeVersion: submissionVersion, recorded: [{ ...decision, noticeVersion: submissionVersion }] },
    { noticeVersion: submissionVersion, recorded: [{ ...decision, purpose: 'marketing_email' }] },
  ])('does not acknowledge an invalid receipt: %p', (value) => {
    expect(() => parseProductAnalyticsReceipt(value, {
      noticeVersion: submissionVersion, granted: true,
    })).toThrow();
  });

  it('does not turn a requested denial into an acknowledged grant', () => {
    expect(() => parseProductAnalyticsReceipt({
      noticeVersion: submissionVersion, recorded: [decision],
    }, { noticeVersion: submissionVersion, granted: false })).toThrow();
  });
});
