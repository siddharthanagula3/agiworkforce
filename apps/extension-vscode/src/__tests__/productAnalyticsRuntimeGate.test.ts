import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
  PRODUCT_ANALYTICS_INGEST_PATH,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
} from '@agiworkforce/types';

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/api')>()),
  getAccountToken: async () => 'token',
  getCloudWebOrigin: () => 'https://agiworkforce.test',
}));
vi.mock('../platform/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../platform/config')>();
  return { ...actual, Config: { ...actual.Config, telemetryEnabled: () => true } };
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
});
