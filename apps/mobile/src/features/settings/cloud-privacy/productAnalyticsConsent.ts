import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
  readProductAnalyticsConsent,
} from '@agiworkforce/types';

export interface ProductAnalyticsChoice {
  granted: boolean;
  noticeVersion: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid consent response');
  }
  return value as Record<string, unknown>;
}

function noticeVersion(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 32) {
    throw new Error('Invalid consent notice');
  }
  return value;
}

function decisions(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Invalid consent decisions');
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    const decision = record(entry);
    if (
      typeof decision.purpose !== 'string' ||
      !decision.purpose.trim() ||
      typeof decision.granted !== 'boolean' ||
      seen.has(decision.purpose)
    ) {
      throw new Error('Invalid consent decision');
    }
    noticeVersion(decision.noticeVersion);
    seen.add(decision.purpose);
    return decision;
  });
}

export function parseProductAnalyticsChoice(value: unknown): ProductAnalyticsChoice {
  const body = record(value);
  const version = noticeVersion(body.noticeVersion);
  const consents = decisions(body.consents);
  if (!Array.isArray(body.purposes)) throw new Error('Invalid consent purposes');
  const purposes = body.purposes.map((purpose: unknown) => {
    const id = record(purpose).id;
    if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid consent purpose');
    return id;
  });
  if (!purposes.includes(PRODUCT_ANALYTICS_CONSENT_PURPOSE)) {
    throw new Error('Product analytics consent unavailable');
  }
  return { granted: readProductAnalyticsConsent({ consents }), noticeVersion: version };
}

export function parseProductAnalyticsReceipt(
  value: unknown,
  submitted: ProductAnalyticsChoice,
): ProductAnalyticsChoice {
  const body = record(value);
  const version = noticeVersion(body.noticeVersion);
  const recorded = decisions(body.recorded);
  const decision = recorded[0];
  if (
    version !== submitted.noticeVersion ||
    recorded.length !== 1 ||
    decision?.purpose !== PRODUCT_ANALYTICS_CONSENT_PURPOSE ||
    decision.noticeVersion !== PRODUCT_ANALYTICS_NOTICE_VERSION ||
    (!submitted.granted && decision.granted !== false)
  ) {
    throw new Error('Unconfirmed product analytics consent');
  }
  return { granted: decision.granted === true, noticeVersion: version };
}
