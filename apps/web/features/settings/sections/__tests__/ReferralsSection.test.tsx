import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
type ScanModule0 = typeof import('@/lib/client/csrf');
type ScanModule1 = typeof import('@shared/utils/browser-utils');

const mocks = vi.hoisted(() => ({
  addCsrfHeaders: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  addCsrfHeaders: mocks.addCsrfHeaders,
}));
vi.mock('@shared/utils/browser-utils', async (importOriginal) => {
  const actual = await importOriginal<ScanModule1>();
  return { ...actual, safeClipboard: { ...actual.safeClipboard, writeText: mocks.writeText } };
});

import { ReferralsSection } from '../ReferralsSection';

const LINK = 'https://agiworkforce.com/r/ABCD2345';

const PROGRAM = {
  friendTrialDays: 7,
  rewardCredits: 500,
  holdDays: 14,
  monthlyRewardCap: 10,
  yearlyRewardCap: 50,
  bonusExpiryDays: 90,
};

function overview(overrides: Record<string, unknown> = {}) {
  return {
    code: 'ABCD2345',
    link: LINK,
    program: PROGRAM,
    stats: { joined: 0, subscribed: 0, rewarded: 0, creditsEarned: 0 },
    bonus: { availableCredits: 0, nextExpiry: null },
    friends: [],
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.spyOn(global, 'fetch');
  mocks.addCsrfHeaders.mockResolvedValue({ 'x-csrf-token': 'csrf-token' });
  mocks.writeText.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReferralsSection', () => {
  it('shows the invite link, the progress and the program terms', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        overview({
          stats: { joined: 3, subscribed: 2, rewarded: 1, creditsEarned: 500 },
          bonus: { availableCredits: 250.5, nextExpiry: '2026-12-26T00:00:00.000Z' },
        }),
      ),
    );

    render(<ReferralsSection />);

    expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(LINK);
    expect(
      screen.getByText(
        'Invite friends to AGI. They get 7 days of Pro free, and when their first payment goes through you each get 500 credits.',
      ),
    ).toBeInTheDocument();
    const progress = within(screen.getByRole('region', { name: 'Your progress' }));
    expect(progress.getByText('Friends joined').nextElementSibling).toHaveTextContent('3');
    expect(progress.getByText('Credits earned').nextElementSibling).toHaveTextContent(
      '500 credits',
    );
    expect(progress.getByText('Bonus credits left').nextElementSibling).toHaveTextContent(
      '250.5 credits',
    );
    expect(progress.getByText(/^Next expiry /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'referral program terms' })).toHaveAttribute(
      'href',
      '/referral-terms',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates the code on the first visit with a CSRF-protected request', async () => {
    fetchMock
      .mockResolvedValueOnce(json(overview({ code: null, link: null })))
      .mockResolvedValueOnce(json({ code: 'ABCD2345', link: LINK }));

    render(<ReferralsSection />);

    expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(LINK);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/referrals/code',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': 'csrf-token' },
      }),
    );
  });

  it('says no one has joined yet when the list is empty', async () => {
    fetchMock.mockResolvedValueOnce(json(overview()));

    render(<ReferralsSection />);

    expect(
      await screen.findByText(
        'No one has joined with your link yet. Friends who sign up with it appear here.',
      ),
    ).toBeInTheDocument();
  });

  it('names every state a referred friend can be in', async () => {
    const friend = (id: string, status: string, rewardAt: string | null = null) => ({
      id,
      status,
      joinedAt: '2026-09-01T00:00:00.000Z',
      rewardAt,
    });
    fetchMock.mockResolvedValueOnce(
      json(
        overview({
          friends: [
            friend('a', 'signed_up'),
            friend('b', 'converted', '2026-10-01T00:00:00.000Z'),
            friend('c', 'rewarded'),
            friend('d', 'capped'),
            friend('e', 'blocked'),
            friend('f', 'clawed_back'),
          ],
        }),
      ),
    );

    render(<ReferralsSection />);

    const friends = within(await screen.findByRole('region', { name: 'Friends' }));
    for (const label of [
      'Joined',
      'Subscribed',
      'Reward earned',
      'Over the reward limit',
      'Not eligible',
      'Payment reversed',
    ]) {
      expect(friends.getByText(label, { exact: true })).toBeInTheDocument();
    }
    expect(
      friends.getByText('Your 500 credits follow their first payment after the 7-day trial.'),
    ).toBeInTheDocument();
    expect(friends.getByText('Rewards stop at 10 a month and 50 a year.')).toBeInTheDocument();
    expect(
      friends.getByText('Their payment was refunded or disputed, so the rewards were removed.'),
    ).toBeInTheDocument();
  });

  it('says the link was copied, or how to copy it when the browser refuses', async () => {
    fetchMock.mockResolvedValueOnce(json(overview()));
    render(<ReferralsSection />);
    const copy = await screen.findByRole('button', { name: 'Copy link' });

    fireEvent.click(copy);
    expect(await screen.findByRole('status')).toHaveTextContent('Invite link copied.');
    expect(mocks.writeText).toHaveBeenCalledWith(LINK);

    mocks.writeText.mockResolvedValueOnce(false);
    fireEvent.click(copy);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Copying is blocked here. Select the link and copy it.',
      ),
    );
  });

  it('shows the error with a retry that loads the page again', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: 'Referrals are unavailable.' } }, 503))
      .mockResolvedValueOnce(json(overview()));

    render(<ReferralsSection />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Referrals could not load');
    expect(screen.queryByRole('textbox', { name: 'Invite link' })).toBeNull();

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('textbox', { name: 'Invite link' })).toHaveValue(LINK);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
