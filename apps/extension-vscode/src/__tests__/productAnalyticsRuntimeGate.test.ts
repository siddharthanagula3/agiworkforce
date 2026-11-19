import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
  PRODUCT_ANALYTICS_INGEST_PATH,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
} from '@agiworkforce/types';
type ScanModule0 = typeof import('../utils/api');
type ScanModule1 = typeof import('../platform/config');

const telemetry = vi.hoisted(() => ({
  enabled: true,
  tokenGate: undefined as Promise<void> | undefined,
}));

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getAccountToken: async () => {
    await telemetry.tokenGate;
    return 'token';
  },
  getCloudWebOrigin: () => 'https://agiworkforce.test',
}));
vi.mock('../platform/config', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return { ...actual, Config: { ...actual.Config, telemetryEnabled: () => telemetry.enabled } };
});
vi.mock('../platform/platformHeaders', () => ({ platformRequestHeaders: () => ({}) }));

import {
  activateProductAnalytics,
  trackProductEvent,
} from '../features/analytics/productAnalytics';

const fetchMock = vi.fn(async (url: string) => ({
  ok: true,
  json: async () =>
    url.endsWith(PRODUCT_ANALYTICS_INGEST_PATH)
      ? {}
      : {
          consents: [
            {
              purpose: 'product_analytics',
              granted: true,
              noticeVersion: PRODUCT_ANALYTICS_NOTICE_VERSION,
            },
          ],
        },
}));

function context(): vscode.ExtensionContext {
  return { secrets: {} } as unknown as vscode.ExtensionContext;
}

describe('VS Code product analytics runtime gate', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    telemetry.enabled = true;
    telemetry.tokenGate = undefined;
    vi.stubGlobal('fetch', fetchMock);
  });

  it('drops local, BYOK and unresolved turns before any request', async () => {
    const disposable = activateProductAnalytics(context());
    for (const trustMode of ['local', 'byok', 'unknown', undefined] as const) {
      trackProductEvent('response_regenerated', trustMode);
    }
    disposable.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a managed turn', async () => {
    const disposable = activateProductAnalytics(context());
    trackProductEvent('response_regenerated', 'managed');
    disposable.dispose();

    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => url.endsWith(PRODUCT_ANALYTICS_INGEST_PATH)),
      ).toHaveLength(1),
    );
  });

  it('sends nothing when telemetry is switched off while the consent lookup is pending', async () => {
    let release!: () => void;
    telemetry.tokenGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const disposable = activateProductAnalytics(context());
    trackProductEvent('response_regenerated', 'managed');
    disposable.dispose();
    telemetry.enabled = false;
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith(PRODUCT_ANALYTICS_INGEST_PATH)),
    ).toHaveLength(0);
  });

  it('sends nothing when telemetry is switched off while the credential lookup is pending', async () => {
    vi.useFakeTimers();
    try {
      const disposable = activateProductAnalytics(context());
      trackProductEvent('response_regenerated', 'managed');
      await vi.advanceTimersByTimeAsync(5_000);
      const ingestCalls = () =>
        fetchMock.mock.calls.filter(([url]) => url.endsWith(PRODUCT_ANALYTICS_INGEST_PATH));
      expect(ingestCalls()).toHaveLength(1);

      let release!: () => void;
      telemetry.tokenGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      trackProductEvent('response_regenerated', 'managed');
      await vi.advanceTimersByTimeAsync(5_000);
      telemetry.enabled = false;
      release();
      await vi.advanceTimersByTimeAsync(20);

      expect(ingestCalls()).toHaveLength(1);
      disposable.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
