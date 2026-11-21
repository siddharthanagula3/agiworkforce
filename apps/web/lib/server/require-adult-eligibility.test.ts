import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}));
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (...args: unknown[]) => mocks.state(...args),
}));

import { requireAdultEligibility } from './require-adult-eligibility';

const REVIEW = '/login/complete?redirectTo=%2Fchat%2Fsession-1%3Fpanel%3Dfiles';

describe('requireAdultEligibility', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not interrupt an account with a current 18 and over decision', async () => {
    mocks.state.mockResolvedValue('confirmed');

    await requireAdultEligibility('user-1', '/chat/session-1?panel=files');

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('sends an account nobody has asked to the review screen and back to its route', async () => {
    mocks.state.mockResolvedValue('unconfirmed');

    await requireAdultEligibility('user-1', '/chat/session-1?panel=files');

    expect(mocks.redirect).toHaveBeenCalledWith(REVIEW);
  });

  it('sends a refused account to the same screen, which tells it why', async () => {
    mocks.state.mockResolvedValue('ineligible');

    await requireAdultEligibility('user-1', '/chat/session-1?panel=files');

    expect(mocks.redirect).toHaveBeenCalledWith(REVIEW);
  });

  it('opens nothing when the decision cannot be read', async () => {
    mocks.state.mockRejectedValue(new Error('database unavailable'));

    await expect(requireAdultEligibility('user-1', '/chat')).rejects.toThrow(
      'database unavailable',
    );
  });
});
