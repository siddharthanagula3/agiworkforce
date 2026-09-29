import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRODUCT_ANALYTICS_INGEST_PATH,
  PRODUCT_ANALYTICS_NOTICE_VERSION,
} from '@agiworkforce/types';

vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  FREE_TRIAL_GATEWAY: 'https://gateway.test',
  getAuthToken: async () => 'token',
}));
vi.mock('../src/platformHeaders', () => ({ platformRequestHeaders: () => ({}) }));

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

const { flushProductEvents, trackProductEvent } =
  await import('../src/features/observability/productAnalytics');

function ingestCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => url.endsWith(PRODUCT_ANALYTICS_INGEST_PATH)).length;
}

describe('Chrome product analytics runtime gate', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('drops a local turn and a turn with no runtime before any request', async () => {
    trackProductEvent('response_regenerated', 'local');
    trackProductEvent('response_regenerated', undefined);
    await flushProductEvents();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a managed cloud turn', async () => {
    trackProductEvent('response_regenerated', 'managed-cloud');
    await flushProductEvents();

    expect(ingestCalls()).toBe(1);
  });
});
