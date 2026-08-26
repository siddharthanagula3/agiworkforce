import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: (...args: unknown[]) => mocks.auth(...args) }));
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mocks.redirect(...args) }));

import TasksLayout from '../layout';

describe('tasks layout auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a request with no verified session instead of rendering the route', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const rendered = await TasksLayout({ children: 'tasks' });

    expect(mocks.redirect).toHaveBeenCalledWith('/login?redirectTo=/tasks');
    expect(rendered).toBeUndefined();
  });

  it('renders for a signed-in user', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user-1' });

    const rendered = await TasksLayout({ children: 'tasks' });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(rendered).toMatchObject({ props: { children: 'tasks' } });
  });
});
