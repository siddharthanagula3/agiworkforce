import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sentryInit, privacyModeMock } = vi.hoisted(() => ({
  sentryInit: vi.fn(),
  privacyModeMock: vi.fn(() => 'managed' as string),
}));

vi.mock('@sentry/react', () => ({
  init: sentryInit,
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  close: vi.fn(async () => true),
}));
vi.mock('../analytics', () => ({ analytics: { track: vi.fn() } }));
vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: { getState: () => ({}) },
  selectPrivacyMode: () => privacyModeMock(),
}));

import { ErrorTrackingService } from '../errorTracking';

const RELEASE_DSN = 'https://publickey@o42.ingest.example.com/7';

interface InitOptions {
  dsn: string;
  beforeSend: (event: Record<string, unknown>, hint: unknown) => Record<string, unknown> | null;
  beforeSendTransaction: (event: Record<string, unknown>) => Record<string, unknown> | null;
}

function initOptions(): InitOptions {
  return sentryInit.mock.calls[0]![0] as InitOptions;
}

beforeEach(() => {
  localStorage.clear();
  sentryInit.mockReset();
  privacyModeMock.mockReturnValue('managed');
  vi.stubEnv('VITE_SENTRY_DSN', RELEASE_DSN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('desktop crash reporting in a release build', () => {
  it('starts only after the user turns crash reports on, with the DSN the release injected', () => {
    const service = new ErrorTrackingService();
    service.initialize();
    expect(sentryInit).not.toHaveBeenCalled();

    service.updateConfig({ enabled: true });

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(initOptions().dsn).toBe(RELEASE_DSN);
  });

  it('drops an automatically captured error or transaction once the app is in Local or BYOK mode', () => {
    const service = new ErrorTrackingService();
    service.updateConfig({ enabled: true });
    const { beforeSend, beforeSendTransaction } = initOptions();

    const event = { request: { url: 'https://app.local/chat?id=1', cookies: 'a=b' } };
    expect(beforeSend({ ...event }, {})).toMatchObject({
      request: { url: 'https://app.local/chat' },
    });
    expect(beforeSendTransaction({ transaction: 'route' })).toEqual({ transaction: 'route' });

    for (const mode of ['local', 'byok']) {
      privacyModeMock.mockReturnValue(mode);
      expect(beforeSend({ ...event }, {})).toBeNull();
      expect(beforeSendTransaction({ transaction: 'route' })).toBeNull();
    }

    privacyModeMock.mockImplementation(() => {
      throw new Error('store unavailable');
    });
    expect(beforeSend({ ...event }, {})).toBeNull();
  });
});
