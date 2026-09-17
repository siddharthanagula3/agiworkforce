import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requirePlatformAdmin: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/auth-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }));

import { NextRequest } from 'next/server';
import { GET } from './route';

function request() {
  return new NextRequest('https://agiworkforce.com/api/admin/service-dashboards');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'admin-1' });
});

describe('GET /api/admin/service-dashboards', () => {
  it('reads nothing when the caller is not a platform admin', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new Error('not an admin'));
    const response = await GET(request());
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('serves every panel with the query that draws it', async () => {
    const response = await GET(request());
    const body = (await response.json()) as {
      dashboards: { id: string; panels: { id: string; query: string }[] }[];
    };

    const ids = body.dashboards.map((dashboard) => dashboard.id);
    expect(ids).toContain('http-traffic');
    expect(ids).toContain('browser-health');
    expect(ids).toContain('notification-delivery');
    for (const dashboard of body.dashboards) {
      expect(dashboard.panels.length).toBeGreaterThan(0);
      for (const panel of dashboard.panels)
        expect(panel.query).toMatch(/rate\(|histogram_quantile/u);
    }
  });

  it('says a panel has nothing to read when no metrics backend is configured', async () => {
    vi.stubEnv('AGI_OTEL_EXPORTER_ENDPOINT', '');
    const body = (await (await GET(request())).json()) as { metricsBackendConfigured: boolean };
    expect(body.metricsBackendConfigured).toBe(false);
  });

  it('names the service the panels query once an exporter is set', async () => {
    vi.stubEnv('AGI_OTEL_EXPORTER_ENDPOINT', 'https://collector.internal:4318');
    vi.stubEnv('AGI_OTEL_SERVICE_NAME', 'agiworkforce-web');
    const body = (await (await GET(request())).json()) as {
      metricsBackendConfigured: boolean;
      serviceName: string | null;
    };
    expect(body.metricsBackendConfigured).toBe(true);
    expect(body.serviceName).toBe('agiworkforce-web');
  });

  it('never caches an operator read', async () => {
    expect((await GET(request())).headers.get('Cache-Control')).toBe('private, no-store');
  });
});
