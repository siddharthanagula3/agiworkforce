import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RoutingHealthPanel from './RoutingHealthPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const QUIET_OBSERVATIONS = {
  sampleCount: 0,
  consecutiveFailures: 0,
  successRate: null,
  rateLimitRate: null,
  serverErrorRate: null,
  timeoutRate: null,
  streamCorruptionRate: null,
  cooldownUntil: null,
};

const TRIPPED_OBSERVATIONS = {
  sampleCount: 40,
  consecutiveFailures: 12,
  successRate: 0.25,
  rateLimitRate: 0.1,
  serverErrorRate: 0.6,
  timeoutRate: 0.05,
  streamCorruptionRate: 0,
  cooldownUntil: '2026-09-05T12:00:00.000Z',
};

const QUIET_PROVIDER = {
  provider: 'provider-quiet',
  credentialClass: 'api_key' as const,
  liveRoutes: 24,
  degradeAtFailures: 7,
  openAtFailures: 12,
  observationWindowMs: 1_800_000,
  resetMs: 600_000,
  providerState: 'closed' as const,
  credentialState: 'closed' as const,
  credentialUnfunded: false,
  providerObservations: QUIET_OBSERVATIONS,
  credentialObservations: QUIET_OBSERVATIONS,
};

const UNFUNDED_PROVIDER = {
  ...QUIET_PROVIDER,
  provider: 'provider-unfunded',
  credentialUnfunded: true,
};

const TRIPPED_PROVIDER = {
  ...QUIET_PROVIDER,
  provider: 'provider-tripped',
  liveRoutes: 8,
  providerState: 'open' as const,
  credentialState: 'degraded' as const,
  providerObservations: TRIPPED_OBSERVATIONS,
  credentialObservations: TRIPPED_OBSERVATIONS,
};

const SUMMARY = {
  providers: [QUIET_PROVIDER, TRIPPED_PROVIDER],
  lockoutWindowMs: 900_000,
  lockoutOpenAtFailures: 3,
};

const ROUTE_ROW = {
  routeId: 'provider-tripped/route-one',
  provider: 'provider-tripped',
  modelKey: 'route-one',
  state: 'half_open' as const,
  observations: TRIPPED_OBSERVATIONS,
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function respondWith(summary: unknown, routes: unknown[]) {
  return async (url: string) =>
    url.includes('provider=')
      ? jsonResponse({ provider: TRIPPED_PROVIDER.provider, routes })
      : jsonResponse(summary);
}

describe('RoutingHealthPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading breaker state before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<RoutingHealthPanel />);

    expect(screen.getByText('Reading breaker state…')).toBeInTheDocument();
  });

  it('shows each provider with its credential class and both breaker scopes', async () => {
    mocks.fetch.mockImplementation(respondWith(SUMMARY, [ROUTE_ROW]));
    render(<RoutingHealthPanel />);

    expect(await screen.findByText(QUIET_PROVIDER.provider)).toBeInTheDocument();
    expect(screen.getByText(TRIPPED_PROVIDER.provider)).toBeInTheDocument();
    expect(screen.getAllByText('api_key').length).toBe(SUMMARY.providers.length);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('reads an absent cooldown as none, and an unmeasured rate as a gap', async () => {
    mocks.fetch.mockImplementation(
      respondWith({ ...SUMMARY, providers: [QUIET_PROVIDER] }, [ROUTE_ROW]),
    );
    const { container } = render(<RoutingHealthPanel />);

    await screen.findByText(QUIET_PROVIDER.provider);
    const cooldown = container.querySelector('[data-cooldown]');

    expect(cooldown?.textContent).toBe('none');
    expect(cooldown?.textContent).not.toBe('not recorded');
    expect(screen.getByText('not recorded')).toBeInTheDocument();
  });

  it('tells the operator when every row is the healthy default rather than a measurement', async () => {
    mocks.fetch.mockImplementation(
      respondWith({ ...SUMMARY, providers: [QUIET_PROVIDER] }, [ROUTE_ROW]),
    );
    render(<RoutingHealthPanel />);

    expect(
      await screen.findByText(/No provider has recorded an outcome inside its observation window/),
    ).toBeInTheDocument();
  });

  it('reads route lockouts only for the provider the operator opens', async () => {
    mocks.fetch.mockImplementation(respondWith(SUMMARY, [ROUTE_ROW]));
    render(<RoutingHealthPanel />);

    await screen.findByText(TRIPPED_PROVIDER.provider);
    expect(
      mocks.fetch.mock.calls.some((call: unknown[]) => String(call[0]).includes('provider=')),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: `${TRIPPED_PROVIDER.liveRoutes} live` }));

    expect(await screen.findByText(ROUTE_ROW.routeId)).toBeInTheDocument();
    expect(screen.getByText('Half open')).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`provider=${TRIPPED_PROVIDER.provider}`),
        expect.anything(),
      ),
    );
  });

  it('reports an unfunded credential beside the cooldown state, not instead of it', async () => {
    mocks.fetch.mockImplementation(
      respondWith({ ...SUMMARY, providers: [UNFUNDED_PROVIDER] }, [ROUTE_ROW]),
    );
    const { container } = render(<RoutingHealthPanel />);

    await screen.findByText(UNFUNDED_PROVIDER.provider);

    expect(container.querySelector('[data-credential-unfunded]')?.textContent).toBe('Unfunded');
    expect(screen.getAllByText('Closed').length).toBe(2);
  });

  it('shows no unfunded badge for a funded credential', async () => {
    mocks.fetch.mockImplementation(
      respondWith({ ...SUMMARY, providers: [QUIET_PROVIDER] }, [ROUTE_ROW]),
    );
    const { container } = render(<RoutingHealthPanel />);

    await screen.findByText(QUIET_PROVIDER.provider);
    expect(container.querySelector('[data-credential-unfunded]')).toBeNull();
  });

  it('surfaces a failed health read as an alert', async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: { message: 'Not found.' } }, 404),
    );
    render(<RoutingHealthPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read routing health.');
  });
});
