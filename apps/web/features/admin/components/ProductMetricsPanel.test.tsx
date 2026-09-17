import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ProductMetricsPanel from './ProductMetricsPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const SUMMARY = {
  from: '2026-08-18T00:00:00.000Z',
  to: '2026-09-17T00:00:00.000Z',
  metrics: [
    { metric: 'dau', numerator: 412, denominator: 0, value: 412 },
    { metric: 'wau', numerator: 1840, denominator: 0, value: 1840 },
    { metric: 'mau', numerator: 5200, denominator: 0, value: 5200 },
    { metric: 'retention_d7', numerator: 12, denominator: 48, value: 0.25 },
    { metric: 'retention_d30', numerator: 0, denominator: 0, value: null },
    { metric: 'arr_microusd', numerator: 1_200_000_000, denominator: 0, value: 1_200_000_000 },
    { metric: 'gross_margin', numerator: 600_000, denominator: 1_000_000, value: 0.6 },
    { metric: 'tool_failure_rate', numerator: 5, denominator: 100, value: 0.05 },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

describe('ProductMetricsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is measuring before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<ProductMetricsPanel />);

    expect(screen.getByText('Measuring the window…')).toBeInTheDocument();
  });

  it('asks for the window the controls show', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(SUMMARY));
    render(<ProductMetricsPanel />);

    await screen.findByRole('region', { name: 'Engagement' });
    const url = String(mocks.fetch.mock.calls[0]?.[0]);
    expect(url.startsWith('/api/admin/product-metrics?')).toBe(true);
    expect(url).toContain('from=');
    expect(url).toContain('to=');
  });

  it('groups every metric under the question it answers', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(SUMMARY));
    render(<ProductMetricsPanel />);

    const engagement = await screen.findByRole('region', { name: 'Engagement' });
    expect(within(engagement).getByText('412')).toBeInTheDocument();
    expect(within(engagement).getByText('5,200')).toBeInTheDocument();

    const retention = screen.getByRole('region', { name: 'Retention' });
    expect(within(retention).getByText('25.0%')).toBeInTheDocument();
    expect(within(retention).getByText('12 of 48')).toBeInTheDocument();

    const revenue = screen.getByRole('region', { name: 'Funnel and revenue' });
    expect(within(revenue).getByText('$1,200.00')).toBeInTheDocument();
    expect(within(revenue).getByText('60.0%')).toBeInTheDocument();

    const quality = screen.getByRole('region', { name: 'Answer quality' });
    expect(within(quality).getByText('5.0%')).toBeInTheDocument();
  });

  it('reports a ratio with no population as nothing to measure, not as zero', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse(SUMMARY));
    render(<ProductMetricsPanel />);

    const retention = await screen.findByRole('region', { name: 'Retention' });
    expect(within(retention).getByText('nothing to measure')).toBeInTheDocument();
    expect(within(retention).queryByText('0.0%')).not.toBeInTheDocument();
  });

  it('says so when the window measured nothing at all', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ ...SUMMARY, metrics: [] }));
    render(<ProductMetricsPanel />);

    expect(await screen.findByText(/Nothing was measured over this window/)).toBeInTheDocument();
  });

  it('surfaces a refusal as an alert with a way back', async () => {
    mocks.fetch.mockResolvedValue(jsonResponse({ error: { message: 'Access denied' } }, 403));
    render(<ProductMetricsPanel />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
