/**
 * CRIT-014 — the admin console shell must enforce account status, not just role.
 *
 * `POST /api/admin/security?action=suspend-user` writes
 * `profiles.account_status` and deliberately leaves the Clerk session alive
 * (only `ban-user` calls `clerk.users.banUser`). The layout's gate was
 * "signed in AND publicMetadata.role is admin/owner", both of which a suspended
 * admin still satisfies, so the console kept rendering for them.
 *
 * Remove the `assertAccountActive` block from `apps/web/app/admin/layout.tsx`
 * and the first two tests below fail — the layout returns children for a
 * suspended admin instead of redirecting.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockAuth, mockGetUser, mockRedirect, mockAssertAccountActive } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn(),
  mockAssertAccountActive: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: async () => ({ users: { getUser: (...args: unknown[]) => mockGetUser(...args) } }),
}));

// The real `redirect()` signals by throwing; reproduce that so the test proves
// the layout stops rather than merely calling a spy and continuing.
class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    mockRedirect(destination);
    throw new RedirectSignal(destination);
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: (...args: unknown[]) => mockAssertAccountActive(...args),
}));

import AdminLayout from '../layout';
import { createError } from '@/lib/errors';

const ADMIN_ID = 'user_admin_1';
const CHILDREN = 'admin console body';

async function renderLayout(): Promise<{ redirectedTo: string | null; rendered: unknown }> {
  try {
    const rendered = await AdminLayout({ children: CHILDREN });
    return { redirectedTo: null, rendered };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirectedTo: error.destination, rendered: null };
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: ADMIN_ID });
  mockGetUser.mockResolvedValue({ publicMetadata: { role: 'admin' } });
  mockAssertAccountActive.mockResolvedValue(undefined);
});

describe('admin layout account-status gate', () => {
  it('redirects a suspended admin away from the console', async () => {
    mockAssertAccountActive.mockRejectedValue(
      createError.forbidden('Your account has been suspended. Please contact support.'),
    );

    const { redirectedTo, rendered } = await renderLayout();

    expect(redirectedTo).toBe('/');
    expect(rendered).toBeNull();
  });

  it('fails closed when the account-status lookup itself fails', async () => {
    mockAssertAccountActive.mockRejectedValue(
      createError.serviceUnavailable('Unable to verify account status.'),
    );

    const { redirectedTo } = await renderLayout();

    expect(redirectedTo).toBe('/');
  });

  it('checks the status of the signed-in id and renders for an active admin', async () => {
    const { redirectedTo, rendered } = await renderLayout();

    expect(mockAssertAccountActive).toHaveBeenCalledWith(ADMIN_ID);
    expect(redirectedTo).toBeNull();
    expect(rendered).toBe(CHILDREN);
  });

  it('still sends a signed-out visitor to login before any status read', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { redirectedTo } = await renderLayout();

    expect(redirectedTo).toBe('/login?redirectTo=/admin');
    expect(mockAssertAccountActive).not.toHaveBeenCalled();
  });

  it('still sends a non-admin home before any status read', async () => {
    mockGetUser.mockResolvedValue({ publicMetadata: { role: 'member' } });

    const { redirectedTo } = await renderLayout();

    expect(redirectedTo).toBe('/');
    expect(mockAssertAccountActive).not.toHaveBeenCalled();
  });
});
