import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportClientFailure, setClientFailureSink } from '@agiworkforce/unified-chat';

import {
  TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE,
  TELEMETRY_CONSENT_STORAGE_KEY,
} from '@/lib/sentry-shared';

import {
  CLIENT_FAILURE_ENDPOINT,
  CLIENT_FAILURE_PAGE_BUDGET,
  installClientFailureReporting,
  reportClientFailureToPlatform,
  resetClientFailureTransport,
} from '../client-failure-transport';
import { CLIENT_FAILURE_MAX_BODY_BYTES } from '../client-failures';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'token',
  })),
}));

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

function grantConsent(): void {
  document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'true');
}

function bodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(
    ([, init]: unknown[]) =>
      JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  resetClientFailureTransport();
  document.documentElement.removeAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE);
  window.localStorage.clear();
});

afterEach(() => {
  setClientFailureSink(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('consent decides whether this device is measured', () => {
  it('sends nothing when the account has not granted telemetry', async () => {
    reportClientFailureToPlatform({ failure: 'code_copy' });
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the document says no and the local mirror says yes', async () => {
    window.localStorage.setItem(TELEMETRY_CONSENT_STORAGE_KEY, 'true');
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'false');

    reportClientFailureToPlatform({ failure: 'code_copy' });
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends once consent is granted', async () => {
    grantConsent();

    reportClientFailureToPlatform({ failure: 'artifact_load', detail: 'timeout' });
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CLIENT_FAILURE_ENDPOINT);
    expect(init.keepalive).toBe(true);
    expect(bodies()[0]).toEqual({ events: [{ failure: 'artifact_load', detail: 'timeout' }] });
  });
});

describe('what a report is allowed to carry', () => {
  it('carries the class and the reason and nothing a prompt could ride in', async () => {
    grantConsent();

    reportClientFailureToPlatform({ failure: 'markdown_render', detail: 'render' });
    await vi.runAllTimersAsync();

    const body = bodies()[0] as { events: Array<Record<string, unknown>> };
    for (const event of body.events) {
      expect(Object.keys(event).sort()).toEqual(['detail', 'failure']);
    }
    expect(JSON.stringify(body).length).toBeLessThan(CLIENT_FAILURE_MAX_BODY_BYTES);
  });

  it('goes quiet once a page has spent its budget, so a render loop cannot beat the ingest', async () => {
    grantConsent();

    for (let index = 0; index < CLIENT_FAILURE_PAGE_BUDGET + 20; index += 1) {
      reportClientFailureToPlatform({ failure: 'markdown_render' });
    }
    await vi.runAllTimersAsync();

    const reported = bodies().reduce(
      (total, body) => total + (body['events'] as unknown[]).length,
      0,
    );
    expect(reported).toBe(CLIENT_FAILURE_PAGE_BUDGET);
  });

  it('never retries and never throws into the component that reported', async () => {
    grantConsent();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    expect(() => reportClientFailureToPlatform({ failure: 'stream_stall' })).not.toThrow();
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the shared chat surface reaches this platform only once it is installed', () => {
  it('emits nothing before the host installs a sink', async () => {
    grantConsent();

    reportClientFailure({ failure: 'attachment', detail: 'too_large' });
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reaches the ingest once the host installs one', async () => {
    grantConsent();
    installClientFailureReporting();

    reportClientFailure({ failure: 'attachment', detail: 'too_large' });
    await vi.runAllTimersAsync();

    expect(bodies()[0]).toEqual({ events: [{ failure: 'attachment', detail: 'too_large' }] });
  });
});
