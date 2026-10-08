import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
type ScanModule0 = typeof import('@/lib/server/health-check');
type ScanModule1 = typeof import('@/lib/server/slo/attainment');

const { healthChecks, sloAttainment } = vi.hoisted(() => ({
  healthChecks: vi.fn(),
  sloAttainment: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/health-check', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getCachedHealthChecks: healthChecks,
}));
vi.mock('@/lib/server/slo/attainment', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getCachedSloAttainment: sloAttainment,
}));

import StatusPage, { dynamic, metadata } from '../page';
import { STALE_AFTER_SECONDS } from '../signal-view';
import type { HealthCheckResult } from '@/lib/server/health-check';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';
import { STATUS_MIRROR_URL_ENV } from '@/lib/server/incident/out-of-band';
import { contactMailto } from '@/lib/legal-constants';
import { isSupportWidgetVisible } from '@/features/support/lib/route-visibility';

const CHECKED_AT = '2026-09-21T12:00:00.000Z';
const CHECKED_AT_MS = Date.parse(CHECKED_AT);
const CHECKED = new Date(CHECKED_AT).toUTCString();
const MIRROR = 'https://status-mirror.example.test/';
const MS_PER_SECOND = 1_000;
const FRESH_READ_SECONDS = 30;
const AUDITED_STALE_READ_SECONDS = 40 * 60 + 42;
const CHECK_LABELS = [
  'Configuration',
  'Postgres',
  'Cache store',
  'Payments',
  'Chat routing',
  'Work',
  'Voice routing',
  'Search',
  'Semantic search',
];

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

function paymentsFailing(): HealthCheckResult {
  const degraded = passing();
  degraded.status = 'degraded';
  degraded.checks.stripe = { status: 'unhealthy', message: 'unavailable' };
  return degraded;
}

function readSecondsAfterCheck(seconds: number): void {
  vi.setSystemTime(CHECKED_AT_MS + seconds * MS_PER_SECOND);
}

function fakeTimeouts(): void {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  readSecondsAfterCheck(FRESH_READ_SECONDS);
}

async function renderPage(): Promise<void> {
  render(await StatusPage());
}

function summary(): HTMLElement {
  return screen.getByRole('region', { name: 'Current status' });
}

function liveSignal(): HTMLElement {
  return screen.getByRole('list', { name: 'Live signal' });
}

async function renderStatus(): Promise<HTMLElement> {
  await renderPage();
  return liveSignal();
}

function stateSentence(): string {
  return within(summary()).getByRole('heading', { level: 2 }).textContent ?? '';
}

function rowValue(list: HTMLElement, label: string): string {
  const header = within(list).getByText(label);
  return header.closest('li')?.textContent ?? '';
}

function rowLabels(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('listitem')
    .map((row) => row.querySelector('.agi-ds-ledger-label')?.textContent ?? '');
}

function precedes(earlier: Node, later: Node): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function occurrences(text: string, fragment: string): number {
  return text.split(fragment).length - 1;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  readSecondsAfterCheck(FRESH_READ_SECONDS);
  healthChecks.mockResolvedValue(passing());
  sloAttainment.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('/status', () => {
  it('leads with the state, the last check and its age, then each covered check', async () => {
    const signal = await renderStatus();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Service status' })).toBeVisible();
    expect(stateSentence()).toBe('Checks passing');
    expect(summary()).toHaveTextContent(
      `Last successful check: ${CHECKED} (less than a minute ago)`,
    );
    expect(summary()).toHaveTextContent(
      `${Object.keys(passing().checks).length} hosted checks. Failing: none.`,
    );
    for (const label of [
      'Postgres',
      'Payments',
      'Chat routing',
      'Work',
      'Voice routing',
      'Search',
    ]) {
      expect(rowValue(signal, label)).toContain('Passing');
    }
    expect(screen.getByText(/does not verify that a model returns a usable answer/i)).toBeVisible();
    expect(screen.getByText(/model inference and a user chat turn were not tested/i)).toBeVisible();
    expect(signal).not.toHaveTextContent('Operational');
    expect(summary()).not.toHaveTextContent('Operational');
  });

  it('prints the time the run happened once, in the summary, not on every row', async () => {
    const signal = await renderStatus();

    expect(occurrences(document.body.textContent ?? '', CHECKED)).toBe(1);
    expect(summary()).toHaveTextContent(CHECKED);
    expect(signal).not.toHaveTextContent('checked');
  });

  it('gives every check the run reports a row that says what the check proves', async () => {
    const signal = await renderStatus();

    expect(within(signal).getAllByRole('listitem')).toHaveLength(
      Object.keys(passing().checks).length,
    );
    expect(rowValue(signal, 'Postgres')).toContain(
      'A query is executed against the primary database and returns.',
    );
    expect(rowValue(signal, 'Chat routing')).toContain(
      'It does not send a message through the model.',
    );
  });

  it('names the failing check in the summary and lists it first, instead of a blanket outage', async () => {
    healthChecks.mockResolvedValue(paymentsFailing());

    const signal = await renderStatus();

    expect(stateSentence()).toBe('Some checks failing');
    expect(summary()).toHaveTextContent('Failing: Payments.');
    expect(rowLabels(signal)[0]).toBe('Payments');
    expect(rowValue(signal, 'Payments')).toContain('Failing (unavailable)');
    expect(rowValue(signal, 'Chat routing')).toContain('Passing');
    expect(screen.getByText(/Core checks passed, but at least one capability/)).toBeVisible();
  });

  it('names a failing core check that used to have no row to read', async () => {
    const coreDown = passing();
    coreDown.status = 'unhealthy';
    coreDown.checks.cache = { status: 'unhealthy', message: 'unavailable' };
    healthChecks.mockResolvedValue(coreDown);

    const signal = await renderStatus();

    expect(stateSentence()).toBe('Core check failing');
    expect(summary()).toHaveTextContent('Failing: Cache store.');
    expect(rowLabels(signal)[0]).toBe('Cache store');
    expect(rowValue(signal, 'Cache store')).toContain('Failing (unavailable)');
    expect(screen.getByText(/A core check failed on the most recent run/)).toBeVisible();
  });

  it('names a failing semantic search index, which degrades without a core failure', async () => {
    const degraded = passing();
    degraded.status = 'degraded';
    degraded.checks.vector = { status: 'unhealthy', message: 'embedding index missing' };
    healthChecks.mockResolvedValue(degraded);

    const signal = await renderStatus();

    expect(summary()).toHaveTextContent('Failing: Semantic search.');
    expect(rowValue(signal, 'Semantic search')).toContain('Failing (embedding index missing)');
    expect(rowValue(signal, 'Search')).toContain('Passing');
  });

  it('says the check could not run, and shows no component rows, when the health run throws', async () => {
    healthChecks.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    await renderPage();

    expect(stateSentence()).toBe('Checks unavailable');
    expect(summary()).toHaveTextContent('Last successful check: Not completed');
    expect(summary()).toHaveTextContent('No result to show.');
    expect(screen.queryByRole('list', { name: 'Live signal' })).not.toBeInTheDocument();
    expect(screen.queryByText('Postgres')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Passing');
    expect(document.body).not.toHaveTextContent('Stale');
    expect(document.body).not.toHaveTextContent('ECONNREFUSED');
    expect(screen.getByText(/We could not complete the most recent health check/)).toBeVisible();
    expect(document.body).not.toHaveTextContent('the list at the top of this page');
    expect(document.body).not.toHaveTextContent('row above');
    expect(document.body).not.toHaveTextContent(/\bamber\b/i);
    expect(document.body).not.toHaveTextContent(/\bgreen\b/i);
    expect(screen.getByText(/A passing result is worth exactly/)).toHaveTextContent(
      `A passing result is worth exactly ${CHECK_LABELS.length} checks. They are ${CHECK_LABELS.slice(0, -1).join(', ')}, and ${CHECK_LABELS.at(-1)}. No result is available on this load, so the list that states what each one proves is not shown.`,
    );
  });

  it('reads as unavailable when the health run does not answer inside the read timeout', async () => {
    fakeTimeouts();
    healthChecks.mockReturnValue(new Promise(() => {}));

    const pending = StatusPage();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersToNextTimerAsync();
    const page = await pending;
    expect(vi.getTimerCount()).toBe(0);
    render(page);

    expect(stateSentence()).toBe('Checks unavailable');
    expect(screen.queryByRole('list', { name: 'Live signal' })).not.toBeInTheDocument();
  });

  it('leaves no read timeout running once the health run has answered', async () => {
    fakeTimeouts();

    const page = await StatusPage();
    expect(vi.getTimerCount()).toBe(0);
    render(page);

    expect(stateSentence()).toBe('Checks passing');
  });

  it('marks an old result stale and keeps its time, its age, its verdict and its rows', async () => {
    healthChecks.mockResolvedValue(paymentsFailing());
    readSecondsAfterCheck(AUDITED_STALE_READ_SECONDS);

    const signal = await renderStatus();

    expect(stateSentence()).toBe('Stale result');
    expect(summary()).toHaveTextContent(`Last successful check: ${CHECKED} (40 min ago)`);
    expect(summary()).toHaveTextContent(
      `This result is more than ${STALE_AFTER_SECONDS} seconds old. That run reported: Some checks failing.`,
    );
    expect(summary()).toHaveTextContent('Failing in that run: Payments.');
    expect(rowLabels(signal)[0]).toBe('Payments');
    expect(rowValue(signal, 'Payments')).toContain('Failing (unavailable)');
    expect(rowValue(signal, 'Postgres')).toContain('Passing');
    expect(rowValue(signal, 'Postgres')).toContain(
      'this row is as old as the last successful check stated at the top of this page',
    );
    expect(rowValue(signal, 'Search')).toContain('it is exactly as old as that row');
    expect(signal).not.toHaveTextContent(/that far behind|the same minute/i);
    expect(screen.getByText(/comes from an earlier run/)).toHaveTextContent(
      'Reading this page asks for a new run in the background: reload after a few seconds to read its result. If the time of the last check has not moved after a reload, the new run has not completed.',
    );
    expect(document.body).not.toHaveTextContent('still reads stale');
    expect(document.body).not.toHaveTextContent('new runs are not completing');
  });

  it('does not call runs incomplete when a reload shows a later run that has itself gone stale', async () => {
    const laterRun = passing();
    laterRun.timestamp = new Date(
      CHECKED_AT_MS + AUDITED_STALE_READ_SECONDS * MS_PER_SECOND,
    ).toISOString();
    healthChecks.mockResolvedValue(laterRun);
    readSecondsAfterCheck(AUDITED_STALE_READ_SECONDS + STALE_AFTER_SECONDS + 1);

    await renderPage();

    expect(stateSentence()).toBe('Stale result');
    expect(summary()).toHaveTextContent(
      `Last successful check: ${new Date(laterRun.timestamp).toUTCString()} (2 min ago)`,
    );
    expect(summary()).not.toHaveTextContent(CHECKED);
    expect(document.body).not.toHaveTextContent(/runs are not completing/i);
    expect(screen.getByText(/comes from an earlier run/)).toHaveTextContent(
      'If the time of the last check has not moved after a reload',
    );
  });

  it('turns stale only once the result is older than two reuse windows', async () => {
    readSecondsAfterCheck(STALE_AFTER_SECONDS);
    await renderPage();
    expect(stateSentence()).toBe('Checks passing');
    expect(summary()).toHaveTextContent(`${CHECKED} (2 min ago)`);
    expect(document.body).not.toHaveTextContent('Stale');
  });

  it('says stale one second past two reuse windows', async () => {
    readSecondsAfterCheck(STALE_AFTER_SECONDS + 1);
    await renderPage();
    expect(STALE_AFTER_SECONDS).toBe(2 * RENDER_CACHE_SECONDS.liveSignal);
    expect(stateSentence()).toBe('Stale result');
    expect(summary()).toHaveTextContent(`${CHECKED} (2 min ago)`);
  });

  it('renders the page for each request, so the age is never a build-time number', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('puts the summary and the check list ahead of how the checks work', async () => {
    const signal = await renderStatus();

    const title = screen.getByRole('heading', { level: 1 });
    const method = screen.getByRole('heading', { level: 2, name: /How these checks work/ });
    const forgery = screen.getByText(/server-side request forgery vector/);
    const cadence = screen.getByText(/A result is reused for up to/);

    expect(precedes(title, summary())).toBe(true);
    expect(precedes(summary(), signal)).toBe(true);
    expect(precedes(signal, method)).toBe(true);
    expect(precedes(method, forgery)).toBe(true);
    expect(precedes(method, cadence)).toBe(true);
    expect(precedes(method, screen.getByText(/model inference and a user chat turn/i))).toBe(true);
  });

  it('states the reuse window and the stale rule instead of a re-check every minute', async () => {
    await renderPage();

    expect(document.body).not.toHaveTextContent(/re-checked every/i);
    expect(document.body).toHaveTextContent(
      `A result is reused for up to ${RENDER_CACHE_SECONDS.liveSignal} seconds`,
    );
    expect(document.body).toHaveTextContent(
      `marked stale once it is more than ${STALE_AFTER_SECONDS} seconds old`,
    );
    expect(screen.getByText(/in-process, rather than making an HTTP request/)).toBeVisible();
  });

  it('describes the reuse window and the stale threshold in its metadata, from the constants', () => {
    const description = metadata.description ?? '';

    expect(description).toContain(
      `A result is reused for up to ${RENDER_CACHE_SECONDS.liveSignal} seconds, shown with its age, and marked stale past ${STALE_AFTER_SECONDS} seconds.`,
    );
    expect(description).not.toMatch(/re-checked every|every minute/i);
    expect(description).not.toContain('an older one is shown');
  });

  it('says the payments check covers the prices on sale and does not claim purchases are refused', async () => {
    const signal = await renderStatus();

    const payments = rowValue(signal, 'Payments');
    expect(payments).toContain(
      'A read call to the payments API returns and every plan price on sale is active.',
    );
    expect(payments).toContain('some or all purchases may fail');
    expect(payments).toContain('existing plans keep working and chat is unaffected');
    expect(payments).not.toMatch(/refused/i);
  });

  it('keeps the later scope ledger to what the rows above do not already say', async () => {
    await renderPage();

    const scope = screen.getByRole('list', { name: 'Scope of the check' });
    expect(rowLabels(scope)).toEqual(['Model routes', 'Not covered']);
    expect(rowValue(scope, 'Model routes')).toContain(
      'The Chat routing check is the public half of it: a provider fault fails that check only once every configured provider behind the default route is degraded.',
    );
    expect(rowValue(scope, 'Not covered')).toContain(
      'A passing result says nothing about any of these.',
    );
    expect(scope).not.toHaveTextContent(/row above|\b(?:amber|green)\b/i);
    expect(screen.getByText(/A passing result is worth exactly/)).toHaveTextContent(
      'Each row in the list at the top of this page states what it actually proves, which is narrower than its name.',
    );
    expect(document.body).not.toHaveTextContent('No result is available on this load');
  });

  it('offers the report link first in the page body, to the contact mailbox', async () => {
    await renderPage();

    const report = within(summary()).getByRole('link', { name: 'Report a problem' });
    expect(report).toHaveAttribute('href', contactMailto());
    expect(document.querySelector('main a[href], main button')).toBe(report);
  });

  it('keeps the support bubble off the page, so it cannot cover a failing check', () => {
    expect(isSupportWidgetVisible('/status')).toBe(false);
  });

  it('says a durable run waits for a device that is not online rather than being refused', async () => {
    await renderPage();

    expect(
      screen.getByText(/a durable run that needs a device that is not online waits for it/),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent('a page or a device that has moved on');
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

describe('/status renders five states in different words', () => {
  it('never reuses a state sentence across healthy, degraded, core-failing, stale and unavailable', async () => {
    const coreDown = passing();
    coreDown.status = 'unhealthy';
    coreDown.checks.database = { status: 'unhealthy', message: 'unavailable' };

    const scenarios: { result: HealthCheckResult | null; readAfterSeconds: number }[] = [
      { result: passing(), readAfterSeconds: FRESH_READ_SECONDS },
      { result: paymentsFailing(), readAfterSeconds: FRESH_READ_SECONDS },
      { result: coreDown, readAfterSeconds: FRESH_READ_SECONDS },
      { result: passing(), readAfterSeconds: AUDITED_STALE_READ_SECONDS },
      { result: null, readAfterSeconds: FRESH_READ_SECONDS },
    ];

    const sentences: string[] = [];
    for (const { result, readAfterSeconds } of scenarios) {
      readSecondsAfterCheck(readAfterSeconds);
      if (result) healthChecks.mockResolvedValue(result);
      else healthChecks.mockRejectedValue(new Error('no run'));
      const { unmount } = render(await StatusPage());
      sentences.push(stateSentence());
      unmount();
    }

    expect(sentences).toEqual([
      'Checks passing',
      'Some checks failing',
      'Core check failing',
      'Stale result',
      'Checks unavailable',
    ]);
    expect(new Set(sentences).size).toBe(scenarios.length);
  });
});
