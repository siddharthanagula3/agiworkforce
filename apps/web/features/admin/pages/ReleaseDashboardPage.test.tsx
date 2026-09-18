import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import ReleaseDashboardPage from './ReleaseDashboardPage';

const DAY_MS = 86_400_000;

function dashboard(over: Record<string, unknown> = {}) {
  return {
    serving: {
      commit: 'abc1234def567890',
      environment: 'production',
      deploymentId: 'dpl_1',
      region: 'iad1',
    },
    ledger: [],
    events: [],
    chain: { intact: true, brokenAt: null },
    lastRollback: null,
    lastDrill: null,
    drillAgeDays: null,
    ledgerMatchesServing: true,
    retentionDays: 400,
    unreadable: [],
    ...over,
  };
}

function respondWith(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('the release dashboard', () => {
  it('shows what production is serving', async () => {
    respondWith(dashboard());

    render(<ReleaseDashboardPage />);

    await waitFor(() => expect(screen.getByText('abc1234def56')).toBeInTheDocument());
    expect(screen.getByText('iad1')).toBeInTheDocument();
  });

  it('says the rollback path is untested when no drill has succeeded', async () => {
    respondWith(dashboard());

    render(<ReleaseDashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('Never; the rollback path is untested')).toBeInTheDocument(),
    );
  });

  it('names the drill age when one has succeeded', async () => {
    respondWith(
      dashboard({
        lastDrill: {
          id: 2,
          event: 'rollback_drill',
          surface: 'web',
          environment: 'production',
          outcome: 'succeeded',
          commitSha: null,
          deploymentId: 'dpl_good',
          previousDeploymentId: 'dpl_1',
          actor: 'ci',
          source: 'rollback_workflow',
          reason: null,
          runUrl: null,
          recordedAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
        },
        drillAgeDays: 3,
      }),
    );

    render(<ReleaseDashboardPage />);

    await waitFor(() => expect(screen.getByText(/3 days ago/)).toBeInTheDocument());
  });

  it('reports a broken audit chain rather than a count', async () => {
    respondWith(dashboard({ chain: { intact: false, brokenAt: 7 } }));

    render(<ReleaseDashboardPage />);

    await waitFor(() => expect(screen.getByText('Broken at event 7')).toBeInTheDocument());
  });

  it('says production is not the commit last recorded', async () => {
    respondWith(dashboard({ ledgerMatchesServing: false }));

    render(<ReleaseDashboardPage />);

    await waitFor(() =>
      expect(
        screen.getByText('No, production is not the commit last recorded'),
      ).toBeInTheDocument(),
    );
  });

  it('shows an empty trail as empty rather than as an error', async () => {
    respondWith(dashboard());

    render(<ReleaseDashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('No release event recorded yet.')).toBeInTheDocument(),
    );
    expect(screen.getByText('No production deployment has been recorded.')).toBeInTheDocument();
  });

  it('never reads an unreadable trail as an empty one', async () => {
    respondWith(dashboard({ unreadable: ['ledger', 'events'] }));

    render(<ReleaseDashboardPage />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'The audit trail could not be read, so this is not a claim that nothing happened.',
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        'The ledger could not be read, so this is not a claim that nothing shipped.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the error the route gave rather than a blank page', async () => {
    respondWith({ error: 'Not found.' }, false, 404);

    render(<ReleaseDashboardPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Not found.'));
  });

  it('announces loading to a screen reader while the trail is fetched', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    render(<ReleaseDashboardPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
