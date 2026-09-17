import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ServiceDashboardsPanel from './ServiceDashboardsPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const REPORT = {
  metricsBackendConfigured: true,
  serviceName: 'agiworkforce-web',
  dashboards: [
    {
      id: 'http-traffic',
      title: 'HTTP traffic',
      panels: [
        {
          id: 'request-rate',
          title: 'Request rate',
          metric: 'http.server.requests',
          aggregation: 'rate',
          query: 'sum by (http_request_method) (rate(http_server_requests_total[5m]))',
        },
      ],
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

describe('ServiceDashboardsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<ServiceDashboardsPanel />);

    expect(screen.getByText('Reading the dashboard definitions…')).toBeInTheDocument();
  });

  it('shows each panel with the query that draws it', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(REPORT));
    render(<ServiceDashboardsPanel />);

    const dashboard = await screen.findByRole('region', { name: 'HTTP traffic' });
    expect(within(dashboard).getByText('Request rate')).toBeInTheDocument();
    expect(within(dashboard).getByText('per-second rate')).toBeInTheDocument();
    expect(within(dashboard).getByText(/rate\(http_server_requests_total/)).toBeInTheDocument();
  });

  it('names the service the panels query once an exporter is set', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(REPORT));
    render(<ServiceDashboardsPanel />);

    expect(await screen.findByText('A metrics backend is configured.')).toBeInTheDocument();
    expect(screen.getByText('agiworkforce-web')).toBeInTheDocument();
  });

  it('says the backend is unset rather than implying the service is idle', async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({ ...REPORT, metricsBackendConfigured: false, serviceName: null }),
    );
    render(<ServiceDashboardsPanel />);

    expect(await screen.findByText('No metrics backend is configured.')).toBeInTheDocument();
    expect(screen.getByText(/has a series to draw/)).toBeInTheDocument();
  });

  it('says so when the deployment defines no dashboards', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ ...REPORT, dashboards: [] }));
    render(<ServiceDashboardsPanel />);

    expect(await screen.findByText(/defines no dashboards/)).toBeInTheDocument();
  });

  it('surfaces a refusal as an alert with a way back', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: { message: 'Access denied' } }, 403));
    render(<ServiceDashboardsPanel />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
