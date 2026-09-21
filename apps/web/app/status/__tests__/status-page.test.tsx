import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { healthChecks, sloAttainment } = vi.hoisted(() => ({
  healthChecks: vi.fn(),
  sloAttainment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/health-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/health-check')>()),
  getCachedHealthChecks: healthChecks,
}));
vi.mock('@/lib/server/slo/attainment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/slo/attainment')>()),
  getCachedSloAttainment: sloAttainment,
}));

import StatusPage from '../page';
import type { HealthCheckResult } from '@/lib/server/health-check';
import { STATUS_MIRROR_URL_ENV } from '@/lib/server/incident/out-of-band';

const CHECKED_AT = '2026-09-21T12:00:00.000Z';
const MIRROR = 'https://status-mirror.example.test/';

function passing(): HealthCheckResult {
  const ok = { status: 'healthy' as const };
  return {
    status: 'healthy',
    timestamp: CHECKED_AT,
    checks: {
      database: ok,
      stripe: ok,
      environment: ok,
      chat: ok,
      work: ok,
      voice: ok,
      search: ok,
      vector: ok,
      cache: ok,
    },
  };
}

async function renderStatus(): Promise<HTMLElement> {
  render(await StatusPage());
  return screen.getByRole('list', { name: 'Live signal' });
}

function rowValue(list: HTMLElement, label: string): string {
  const header = within(list).getByText(label);
  return header.closest('li')?.textContent ?? '';
}

beforeEach(() => {
  healthChecks.mockResolvedValue(passing());
  sloAttainment.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/status', () => {
  it('reports each covered check with the time the run actually happened', async () => {
    const signal = await renderStatus();

    const checked = new Date(CHECKED_AT).toUTCString();
    expect(rowValue(signal, 'Hosted platform')).toContain(`Operational · checked ${checked}`);
    for (const label of ['Postgres', 'Payments', 'Chat', 'Work', 'Voice', 'Search']) {
      expect(rowValue(signal, label)).toContain(`Passing · checked ${checked}`);
    }
  });

  it('names the failing check and the degraded state instead of a blanket outage', async () => {
    const degraded = passing();
    degraded.status = 'degraded';
    degraded.checks.stripe = { status: 'unhealthy', message: 'unavailable' };
    healthChecks.mockResolvedValue(degraded);

    const signal = await renderStatus();

    expect(rowValue(signal, 'Hosted platform')).toContain('Degraded');
    expect(rowValue(signal, 'Payments')).toContain('Failing (unavailable)');
    expect(rowValue(signal, 'Chat')).toContain('Passing');
    expect(screen.getByText(/Core serving passed, but at least one capability/)).toBeVisible();
  });

  it('says the check could not run, and shows no component rows, when the health run throws', async () => {
    healthChecks.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const signal = await renderStatus();

    expect(rowValue(signal, 'Hosted platform')).toContain('Live check unavailable');
    expect(rowValue(signal, 'Hosted platform')).toContain('Not completed');
    expect(within(signal).queryByText('Postgres')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('ECONNREFUSED');
    expect(screen.getByText(/We could not complete the most recent health check/)).toBeVisible();
  });

  it('blames itself, not the platform, when the service level query fails', async () => {
    sloAttainment.mockRejectedValue(new Error('relation "request_outcomes" does not exist'));

    await renderStatus();

    const levels = screen.getByRole('list', { name: 'Measured service levels' });
    expect(levels).toHaveTextContent(
      'The attainment query did not return. That is a fault in this page, not a statement about the platform.',
    );
    expect(document.body).not.toHaveTextContent('request_outcomes');
  });

  it('says a window with no events has no samples rather than reporting a perfect score', async () => {
    sloAttainment.mockResolvedValue([
      {
        id: 'chat-availability',
        domain: 'Chat',
        kind: 'availability',
        objective: 0.995,
        windowDays: 28,
        windowStart: '2026-08-24T00:00:00.000Z',
        windowEnd: CHECKED_AT,
        samples: 0,
        good: 0,
        attainment: null,
        errorBudgetRemaining: null,
        latencyP95Ms: null,
      },
    ]);

    await renderStatus();

    const levels = screen.getByRole('list', { name: 'Measured service levels' });
    expect(rowValue(levels, 'Chat')).toContain('No samples in the last 28 days');
    expect(levels).not.toHaveTextContent('100.00%');
  });

  it('links the out-of-band mirror only when one is configured', async () => {
    await renderStatus();
    expect(screen.queryByRole('link', { name: 'Open the status mirror' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Not configured. This page is the only place status is published.'),
    ).toBeInTheDocument();
  });

  it('opens the configured mirror', async () => {
    vi.stubEnv(STATUS_MIRROR_URL_ENV, MIRROR);

    await renderStatus();

    expect(screen.getByRole('link', { name: 'Open the status mirror' })).toHaveAttribute(
      'href',
      MIRROR,
    );
  });

  it('promises no written incident post, since the page renders none', async () => {
    await renderStatus();

    const incidentProcess = screen.getByRole('list', { name: 'Incident process' });
    expect(incidentProcess).not.toHaveTextContent(/\bpost(?:ed)? (?:it )?here\b/i);
    expect(incidentProcess).toHaveTextContent('this page carries no written incident posts');
  });
});
