import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  shouldInitializeSentry: vi.fn(),
  commonInitOptions: vi.fn(() => ({ dsn: 'fixture-dsn', enabled: true })),
}));

vi.mock('@sentry/nextjs', () => ({ init: mocks.init }));
vi.mock('@/lib/sentry-shared', () => ({
  DEFAULT_TRACES_SAMPLE_RATE: vi.fn(),
  TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE: vi.fn(),
  TELEMETRY_CONSENT_STORAGE_KEY: vi.fn(),
  confirmTelemetryConsent: vi.fn(),
  getSentryDsn: vi.fn(),
  getSentryEnvironment: vi.fn(),
  getSentryRelease: vi.fn(),
  hasPendingTelemetryOptOut: vi.fn(),
  hasTelemetryConsent: vi.fn(),
  isSentryConfigured: vi.fn(),
  readDocumentTelemetryConsent: vi.fn(),
  redactDeep: vi.fn(),
  requestTelemetryOptOut: vi.fn(),
  scrubBreadcrumb: vi.fn(),
  scrubEvent: vi.fn(),
  scrubSpan: vi.fn(),
  scrubTransactionEvent: vi.fn(),
  setTelemetryConsentCache: vi.fn(),
  shouldInitializeSentry: mocks.shouldInitializeSentry,
  commonInitOptions: mocks.commonInitOptions,
}));

import { initializeSentryAfterConsent } from './initialize-sentry-after-consent';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initializeSentryAfterConsent', () => {
  it('stays fail-closed when the confirmed consent gate is not open', () => {
    mocks.shouldInitializeSentry.mockReturnValue(false);

    initializeSentryAfterConsent();

    expect(mocks.init).not.toHaveBeenCalled();
  });

  it('starts the existing scrubbed client after confirmed opt-in', () => {
    mocks.shouldInitializeSentry.mockReturnValue(true);

    initializeSentryAfterConsent();

    expect(mocks.init).toHaveBeenCalledWith({ dsn: 'fixture-dsn', enabled: true });
  });
});
