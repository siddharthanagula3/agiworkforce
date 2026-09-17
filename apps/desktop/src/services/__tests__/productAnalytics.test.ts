import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
  isPrivateTrustBoundary: vi.fn(),
}));

vi.mock('../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://agiworkforce.com',
  cloudFetch: mocks.cloudFetch,
  getAuthHeaders: mocks.getAuthHeaders,
}));
vi.mock('../../stores/privacyBoundary', () => ({
  isPrivateTrustBoundary: mocks.isPrivateTrustBoundary,
}));

import {
  flushDesktopProductEvents,
  productEventForDesktopEvent,
  trackDesktopProductEvent,
} from '../productAnalytics';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthHeaders.mockResolvedValue({ 'Content-Type': 'application/json' });
  mocks.cloudFetch.mockResolvedValue({ ok: true });
  mocks.isPrivateTrustBoundary.mockReturnValue(false);
});

describe('the desktop mapping onto the shared event contract', () => {
  it('maps the desktop events that mean something to the product, and only those', () => {
    expect(productEventForDesktopEvent('goal_completed')).toEqual({
      name: 'work_run_finished',
      outcome: 'succeeded',
    });
    expect(productEventForDesktopEvent('goal_failed')).toEqual({
      name: 'work_run_finished',
      outcome: 'failed',
    });
    expect(productEventForDesktopEvent('theme_changed')).toBeUndefined();
  });

  it('sends a mapped event to the shared ingest, stamped as the desktop surface', async () => {
    trackDesktopProductEvent('file_uploaded');
    await flushDesktopProductEvents();

    const [url, init] = mocks.cloudFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://agiworkforce.com/api/analytics/events');
    const body = JSON.parse(String(init.body)) as { events: Array<Record<string, unknown>> };
    expect(body.events[0]).toMatchObject({ name: 'file_uploaded', surface: 'desktop' });
  });

  it('sends nothing at all inside a private trust boundary', async () => {
    mocks.isPrivateTrustBoundary.mockReturnValue(true);

    trackDesktopProductEvent('goal_submitted');
    await flushDesktopProductEvents();

    expect(mocks.cloudFetch).not.toHaveBeenCalled();
  });

  it('sends nothing for a desktop event with no product meaning', async () => {
    trackDesktopProductEvent('settings_changed');
    await flushDesktopProductEvents();

    expect(mocks.cloudFetch).not.toHaveBeenCalled();
  });
});
