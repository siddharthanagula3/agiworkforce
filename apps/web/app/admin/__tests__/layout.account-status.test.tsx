import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockAuth,
  mockGetUser,
  mockRedirect,
  mockAssertAccountActive,
  mockRequireCurrentTerms,
  mockAdultEligibility,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn(),
  mockAssertAccountActive: vi.fn(),
  mockRequireCurrentTerms: vi.fn(),
  mockAdultEligibility: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  clerkClient: async () => ({ users: { getUser: (...args: unknown[]) => mockGetUser(...args) } }),
}));

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

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: (...args: unknown[]) => mockAssertAccountActive(...args),
}));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) => mockRequireCurrentTerms(...args),
}));
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (...args: unknown[]) => mockAdultEligibility(...args),
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
  mockRequireCurrentTerms.mockResolvedValue(undefined);
  mockAdultEligibility.mockResolvedValue('confirmed');
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
    expect(rendered).toMatchObject({ props: { children: CHILDREN } });
  });

  it('still sends a lapsed session to the recovery page before any status read', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { redirectedTo } = await renderLayout();

    expect(redirectedTo).toBe('/session-expired?redirectTo=%2Fadmin');
    expect(mockAssertAccountActive).not.toHaveBeenCalled();
  });

  it('still sends a non-admin home before any status read', async () => {
    mockGetUser.mockResolvedValue({ publicMetadata: { role: 'member' } });

    const { redirectedTo } = await renderLayout();

    expect(redirectedTo).toBe('/');
    expect(mockAssertAccountActive).not.toHaveBeenCalled();
  });

  it.each(['unconfirmed', 'ineligible'])(
    'sends an admin whose age decision is %s to the review screen before any status read',
    async (state) => {
      mockAdultEligibility.mockResolvedValue(state);

      const { redirectedTo, rendered } = await renderLayout();

      expect(redirectedTo).toBe('/login/complete?redirectTo=%2Fadmin');
      expect(rendered).toBeNull();
      expect(mockAdultEligibility).toHaveBeenCalledWith(ADMIN_ID);
      expect(mockAssertAccountActive).not.toHaveBeenCalled();
    },
  );
});
