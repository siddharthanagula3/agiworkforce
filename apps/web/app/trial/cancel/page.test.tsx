import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
type NeonDbModule = typeof import('@/lib/server/neon-db');

const mocks = vi.hoisted(() => ({ getNeonDb: vi.fn(), query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: mocks.getNeonDb,
}));

import { trialCancelUrl } from '@/lib/services/trial-cancel-link';
import TrialCancelPage from './page';

const NOW = new Date('2026-10-03T12:00:00Z');
const DAY_SECONDS = 86_400;
const LINK = {
  userId: 'user_123',
  subscriptionId: 'sub_1TrialEndingAbc123',
  trialEnd: Math.floor(NOW.getTime() / 1000) + DAY_SECONDS,
};

function signedToken(link = LINK): string {
  const url = trialCancelUrl(link);
  const token = url ? new URL(url).searchParams.get('token') : null;
  if (!token) throw new Error('The test could not sign a trial cancel link');
  return token;
}

async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  render(await TrialCancelPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  vi.stubEnv('CSRF_SECRET', 'trial-cancel-link-signing-secret-0123456789');
  mocks.query.mockReset();
  mocks.getNeonDb.mockReset();
  mocks.getNeonDb.mockImplementation(() => {
    throw new Error('No database is configured');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('/trial/cancel without a usable link', () => {
  it.each<[string, () => Record<string, string | undefined>]>([
    ['no token', () => ({})],
    ['an empty token', () => ({ token: '' })],
    ['a malformed token', () => ({ token: 'abc' })],
    ['a forged signature', () => ({ token: `${signedToken().split('.')[0]}.forged` })],
    [
      'a link whose trial has already ended',
      () => ({ token: signedToken({ ...LINK, trialEnd: LINK.trialEnd - 2 * DAY_SECONDS }) }),
    ],
  ])('answers %s with the expired-link state and never opens the database', async (_, params) => {
    await renderPage(params());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This link has expired.');
    expect(screen.getByRole('link', { name: 'Manage your plan' })).toHaveAttribute(
      'href',
      '/settings/billing',
    );
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull();
    expect(mocks.getNeonDb).not.toHaveBeenCalled();
  });
});

describe('/trial/cancel with a valid link', () => {
  it('opens the database once, reads the linked subscription and offers the cancellation', async () => {
    mocks.getNeonDb.mockReturnValue({ query: mocks.query, execute: vi.fn() });
    mocks.query.mockResolvedValue([
      { plan_tier: 'pro', status: 'trialing', cancel_at_period_end: false },
    ]);

    await renderPage({ token: signedToken() });

    expect(mocks.getNeonDb).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([LINK.userId, LINK.subscriptionId]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Cancel your .+ trial\?$/);
    expect(screen.getByRole('button', { name: 'Cancel trial' })).toBeEnabled();
  });
});
