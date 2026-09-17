/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key: string, cb: (items: Record<string, unknown>) => void) =>
        cb({ [key]: store[key] }),
      ),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    lastError: undefined as chrome.runtime.LastError | undefined,
    getManifest: () => ({ version: '9.9.9' }),
  },
};
(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

const RELEASE_DSN = 'https://publickey123@o42.ingest.example.com/7';

async function loadReporting() {
  vi.resetModules();
  const consent = await import('../src/features/observability/errorReportingConsent');
  const reporting = await import('../src/features/observability/errorReporting');
  return { consent, reporting };
}

let errorHandler: ((event: ErrorEvent) => void) | undefined;

function raise(message: string): void {
  errorHandler?.(new ErrorEvent('error', { error: new TypeError(message), message }));
}

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  errorHandler = undefined;
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'error') errorHandler = listener as (event: ErrorEvent) => void;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  (globalThis as unknown as Record<string, unknown>).chrome = chromeMock;
});

describe('Chrome extension crash reports in a release build', () => {
  it('sends a scrubbed envelope to the DSN the release injected once the user opted in', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', RELEASE_DSN);
    const { consent, reporting } = await loadReporting();
    store[consent.ERROR_REPORTING_CONSENT_STORAGE_KEY] = true;
    reporting.installSidePanelErrorReporting();
    await consent.readErrorReportingConsent();

    raise('cannot read property of user@example.com');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://o42.ingest.example.com/api/7/envelope/?sentry_key=publickey123&sentry_version=7',
    );
    expect(String(init.body)).toContain('"release":"9.9.9"');
    expect(String(init.body)).toContain('"type":"TypeError"');
    expect(String(init.body)).not.toContain('user@example.com');
  });

  it('sends nothing without consent even when the release carries a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', RELEASE_DSN);
    const { consent, reporting } = await loadReporting();
    reporting.installSidePanelErrorReporting();
    await consent.readErrorReportingConsent();

    raise('boom');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a clean no-op in a build with no DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { consent, reporting } = await loadReporting();
    store[consent.ERROR_REPORTING_CONSENT_STORAGE_KEY] = true;
    reporting.installSidePanelErrorReporting();
    await consent.readErrorReportingConsent();

    raise('boom');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
