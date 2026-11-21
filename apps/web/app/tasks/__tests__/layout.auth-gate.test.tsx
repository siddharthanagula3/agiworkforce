import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
  adultEligibility: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: (...args: unknown[]) => mocks.auth(...args) }));
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mocks.redirect(...args) }));
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (...args: unknown[]) => mocks.adultEligibility(...args),
}));

import TasksLayout from '../layout';

describe('tasks layout auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adultEligibility.mockResolvedValue('confirmed');
  });

  it('redirects a request with no verified session instead of rendering the route', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const rendered = await TasksLayout({ children: 'tasks' });

    expect(mocks.redirect).toHaveBeenCalledWith('/session-expired?redirectTo=%2Ftasks');
    expect(rendered).toBeUndefined();
  });

  it('renders for a signed-in user with an 18 and over decision', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user-1' });

    const rendered = await TasksLayout({ children: 'tasks' });

    expect(mocks.adultEligibility).toHaveBeenCalledWith('user-1');
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(rendered).toMatchObject({ props: { children: 'tasks' } });
  });

  it.each(['unconfirmed', 'ineligible'])(
    'sends a signed-in account whose decision is %s to the age review',
    async (state) => {
      mocks.auth.mockResolvedValue({ userId: 'user-1' });
      mocks.adultEligibility.mockResolvedValue(state);

      await TasksLayout({ children: 'tasks' });

      expect(mocks.redirect).toHaveBeenCalledWith('/login/complete?redirectTo=%2Ftasks');
    },
  );
});
