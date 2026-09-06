import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RouteEconomicsPanel from './RouteEconomicsPanel';
import type { RouteEconomicsRow } from '../services/route-economics';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const MODALITY = {
  textInput: true,
  imageInput: true,
  audioInput: false,
  videoInput: false,
  textOutput: true,
  imageOutput: false,
  audioOutput: false,
  videoOutput: false,
};

function row(overrides: Partial<RouteEconomicsRow> = {}): RouteEconomicsRow {
  return {
    routeId: 'alpha/model-one',
    modelKey: 'model-one',
    modelName: 'Model One',
    developerId: 'labs',
    developerLabel: 'Labs',
    providerId: 'alpha',
    providerLabel: 'Alpha',
    providerModelId: 'model-one-api',
    harnessId: 'alpha/chat',
    availability: 'live',
    selectable: true,
    isDefault: true,
    trustModes: ['managed_cloud'],
    lifecycleStage: 'promoted',
    commercialStatus: 'agi_direct',
    cacheClass: 'no_provider_cache',
    currency: 'USD',
    unit: 'per_million_tokens',
    listInputPerMillion: 10,
    listOutputPerMillion: 40,
    effectiveInputPerMillion: 7.5,
    effectiveOutputPerMillion: 30,
    cacheReadPerMillion: 1,
    cacheWritePerMillion: 2,
    discountPercent: 25,
    contextTokens: 200_000,
    modality: MODALITY,
    functionCalling: true,
    structuredOutput: true,
    reasoning: true,
    streaming: true,
    openWeight: false,
    license: 'proprietary',
    dataRetention: 'zero_retention',
    zeroDataRetention: 'default',
    trainsOnInputs: 'never',
    residencyRegions: ['us'],
    governanceVerifiedOn: '2026-09-05',
    free: {
      status: 'none',
      poolId: null,
      window: null,
      limit: null,
      unit: null,
      expiresAt: null,
      hardStopsBeforePaid: null,
    },
    credentialConfigured: true,
    health: {
      state: 'closed',
      observations: {
        sampleCount: 20,
        consecutiveFailures: 0,
        successRate: 0.95,
        rateLimitRate: 0,
        serverErrorRate: 0,
        timeoutRate: 0,
        streamCorruptionRate: 0,
        ttftP50Ms: 420,
        throughputTokensPerSecond: 60,
        cooldownUntil: null,
      },
    },
    ...overrides,
  };
}

const CHEAP_OPEN_ROUTE = row({
  routeId: 'beta/model-two',
  modelKey: 'model-two',
  modelName: 'Model Two',
  developerId: 'forge',
  developerLabel: 'Forge',
  providerId: 'beta',
  providerLabel: 'Beta',
  providerModelId: 'model-two-api',
  listInputPerMillion: 2,
  listOutputPerMillion: 6,
  effectiveInputPerMillion: 2,
  effectiveOutputPerMillion: 6,
  discountPercent: null,
  openWeight: true,
  reasoning: false,
  free: {
    status: 'eligible',
    poolId: 'beta-free',
    window: 'day',
    limit: 500,
    unit: 'requests',
    expiresAt: '2026-12-01T00:00:00.000Z',
    hardStopsBeforePaid: true,
  },
});

const UNKNOWN_ROUTE = row({
  routeId: 'gamma/model-three',
  modelKey: 'model-three',
  modelName: 'Model Three',
  developerId: null,
  developerLabel: null,
  providerId: 'gamma',
  providerLabel: 'Gamma',
  providerModelId: 'model-three-api',
  listInputPerMillion: null,
  listOutputPerMillion: null,
  effectiveInputPerMillion: null,
  effectiveOutputPerMillion: null,
  cacheReadPerMillion: null,
  discountPercent: null,
  contextTokens: null,
  lifecycleStage: null,
  zeroDataRetention: null,
  trainsOnInputs: null,
  residencyRegions: null,
  governanceVerifiedOn: null,
  credentialConfigured: false,
  health: null,
});

const REPORT = { routes: [row(), CHEAP_OPEN_ROUTE, UNKNOWN_ROUTE] };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function modelColumnOrder(): string[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((tableRow) => within(tableRow).getAllByRole('cell')[0]?.textContent ?? '')
    .filter((text) => text !== '');
}

describe('RouteEconomicsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockImplementation(async () => jsonResponse(REPORT));
  });

  it('says it is reading route economics before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<RouteEconomicsPanel />);

    expect(screen.getByText('Reading route economics…')).toBeInTheDocument();
  });

  it('shows the effective price beside the list price it was discounted from', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    expect(screen.getByText('$7.50')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('reads a price, a context window and a health scope the registry lacks as unknown', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model Three');
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('narrows the table to the routes the search matches', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'model-two' } });

    expect(screen.getByText('Model Two')).toBeInTheDocument();
    expect(screen.queryByText('Model One')).not.toBeInTheDocument();
    expect(screen.queryByText('Model Three')).not.toBeInTheDocument();
  });

  it('narrows the table to one provider', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'gamma' } });

    expect(screen.getByText('Model Three')).toBeInTheDocument();
    expect(screen.queryByText('Model One')).not.toBeInTheDocument();
  });

  it('keeps only open-weight routes when the operator asks for them', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    fireEvent.click(screen.getByLabelText('Open weight'));

    expect(screen.getByText('Model Two')).toBeInTheDocument();
    expect(screen.queryByText('Model One')).not.toBeInTheDocument();
  });

  it('keeps only free-eligible routes when the operator asks for them', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    fireEvent.click(screen.getByLabelText('Free eligible'));

    expect(screen.getByText('Model Two')).toBeInTheDocument();
    expect(screen.queryByText('Model Three')).not.toBeInTheDocument();
  });

  it('sorts by effective input price and puts an unpriced route last', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');

    expect(modelColumnOrder()).toEqual([
      'Model Twobeta/model-two',
      'Model Onealpha/model-one',
      'Model Threegamma/model-three',
    ]);
  });

  it('re-sorts by model name when the operator picks it', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'model' } });

    expect(modelColumnOrder()).toEqual([
      'Model Onealpha/model-one',
      'Model Threegamma/model-three',
      'Model Twobeta/model-two',
    ]);
  });

  it('opens the long tail of a route in a details row', async () => {
    render(<RouteEconomicsPanel />);

    await screen.findByText('Model One');
    expect(screen.queryByText('Provider model id')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show details for Model One' }));

    expect(screen.getByText('Provider model id')).toBeInTheDocument();
    expect(screen.getByText('model-one-api')).toBeInTheDocument();
    expect(screen.getByText('420 ms')).toBeInTheDocument();
  });

  it('surfaces a failed read as an alert', async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: { message: 'Not found.' } }, 404),
    );
    render(<RouteEconomicsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read route economics.');
  });
});
