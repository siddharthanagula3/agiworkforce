import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ServiceHealthPanel from './ServiceHealthPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const SUMMARY = {
  windowStart: '2026-09-16T12:00:00.000Z',
  windowEnd: '2026-09-17T12:00:00.000Z',
  tools: [
    {
      category: 'connector',
      calls: 20,
      failures: 5,
      blocked: 1,
      failureRate: 0.25,
      latencyP50Ms: 310,
      latencyP95Ms: 2400,
    },
  ],
  browser: { commands: 12, handedOff: 10, failures: 0, blocked: 2, failureRate: 0 },
  remote: {
    deviceSteps: 4,
    resolved: 3,
    failed: 1,
    waiting: 0,
    failureRate: 0.25,
    resolveP50Ms: 5200,
    devicesOnline: 2,
    devicesSeenInWindow: 6,
  },
  queues: [
    { queue: 'cloud-agent-turn', depth: 3, inFlight: 9, oldestWaitingAt: null },
    { queue: 'credit-settlement', depth: 0, inFlight: 0, oldestWaitingAt: null },
  ],
  files: { uploaded: 7, extracted: 6, withoutText: 1, extractionRate: 6 / 7, extractionP50Ms: 90 },
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

describe('ServiceHealthPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<ServiceHealthPanel />);

    expect(screen.getByText('Reading service health…')).toBeInTheDocument();
  });

  it('renders every service panel from the summary', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(SUMMARY));
    render(<ServiceHealthPanel />);

    const files = await screen.findByRole('region', { name: 'File processing' });
    expect(within(files).getByText('85.7%')).toBeInTheDocument();
    expect(within(files).getByText('1 without text')).toBeInTheDocument();

    const remote = screen.getByRole('region', { name: 'Remote connection health' });
    expect(within(remote).getByText('25.0%')).toBeInTheDocument();
    expect(within(remote).getByText('6 seen in window')).toBeInTheDocument();

    const browser = screen.getByRole('region', { name: 'Browser health' });
    expect(within(browser).getByText('0.0%')).toBeInTheDocument();

    const queues = screen.getByRole('region', { name: 'Queue depth' });
    expect(within(queues).getByText('cloud-agent-turn')).toBeInTheDocument();
    expect(within(queues).getAllByText('none')).toHaveLength(2);

    const tools = screen.getByRole('region', { name: 'Tool latency and failures' });
    expect(within(tools).getByText('connector')).toBeInTheDocument();
    expect(within(tools).getByText('2,400 ms')).toBeInTheDocument();
  });

  it('shows an empty tool window as a sentence, not an empty table', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ ...SUMMARY, tools: [] }));
    render(<ServiceHealthPanel />);

    expect(await screen.findByText('No tool call was recorded in the window.')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'p95' })).not.toBeInTheDocument();
  });

  it('surfaces a refusal as an alert', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: { message: 'Access denied' } }, 403));
    render(<ServiceHealthPanel />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
