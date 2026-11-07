import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportClientFailure, setClientFailureSink } from '@agiworkforce/unified-chat';

import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  confirmTelemetryConsent,
  requestTelemetryOptOut,
  setTelemetryConsentCache,
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
import { collectDiagnostics } from '@/lib/support/diagnostics/collect';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'token',
  })),
}));

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

function grantConsent(): void {
  confirmTelemetryConsent(true);
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
  setTelemetryConsentCache(false);
  vi.mocked(addCsrfHeaders).mockClear();
});

afterEach(() => {
  setClientFailureSink(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('support diagnostics', () => {
  it('carries the failure into the next support bundle without consent or network', async () => {
    reportClientFailureToPlatform({ failure: 'mermaid_render', detail: 'parse' });
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
    const { recentEvents } = collectDiagnostics({ surface: 'web' });
    expect(recentEvents.at(-1)).toMatchObject({ kind: 'error', message: 'mermaid_render: parse' });
  });
});

describe('consent decides whether this device is measured', () => {
  it('sends nothing when the account has not granted telemetry', async () => {
    reportClientFailureToPlatform({ failure: 'code_copy' });
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the document says no and the local mirror says yes', async () => {
    grantConsent();
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'false');

    reportClientFailureToPlatform({ failure: 'code_copy' });
    await vi.runAllTimersAsync();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['local', 'pending'])('does not let a document grant override %s refusal', async (kind) => {
    grantConsent();
    if (kind === 'pending') requestTelemetryOptOut();
    else setTelemetryConsentCache(false);
    document.documentElement.setAttribute(TELEMETRY_CONSENT_DOCUMENT_ATTRIBUTE, 'true');

    reportClientFailureToPlatform({ failure: 'code_copy' });
    await vi.runAllTimersAsync();

    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'drops a detached batch after opt-out during CSRF acquisition (storage writes fail: %s)',
    async (writesFail) => {
      grantConsent();
      let resolveHeaders!: (headers: HeadersInit) => void;
      vi.mocked(addCsrfHeaders).mockImplementationOnce(
        () =>
          new Promise<HeadersInit>((resolve) => {
            resolveHeaders = resolve;
          }),
      );

      reportClientFailureToPlatform({ failure: 'artifact_load', detail: 'timeout' });
      await vi.runAllTimersAsync();
      expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();

      if (writesFail) {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('Storage writes refused');
        });
      }
      requestTelemetryOptOut();
      if (writesFail) {
        expect(window.localStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY)).toBe('true');
      }
      resolveHeaders({ 'Content-Type': 'application/json', 'x-csrf-token': 'token' });
      await vi.runAllTimersAsync();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(collectDiagnostics({ surface: 'web' }).recentEvents.at(-1)).toMatchObject({
        kind: 'error',
        message: 'artifact_load: timeout',
      });

      vi.restoreAllMocks();
      grantConsent();
      await vi.runAllTimersAsync();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    },
  );

  it('drops a queued batch on refusal before flush without replay on a later grant', async () => {
    grantConsent();
    reportClientFailureToPlatform({ failure: 'code_copy' });
    requestTelemetryOptOut();
    await vi.runAllTimersAsync();

    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    grantConsent();
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();

    reportClientFailureToPlatform({ failure: 'artifact_load', detail: 'timeout' });
    await vi.runAllTimersAsync();
    expect(bodies()).toEqual([{ events: [{ failure: 'artifact_load', detail: 'timeout' }] }]);
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
