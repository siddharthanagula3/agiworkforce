/**
 * admin-layout-role-gate.test.tsx
 *
 * Guards that /admin is only accessible to users whose Clerk publicMetadata.role
 * is 'admin' or 'owner'. Any authenticated user without that role is redirected
 * to '/'.
 *
 * FAILS without the fix (layout.tsx only checks userId, not role).
 * PASSES with the fix (layout.tsx checks publicMetadata.role).
 *
 * SCOPE: this file pins the ROLE dimension only. CRIT-014 added a second gate
 * to the same layout — `assertAccountActive`, which denies a suspended admin
 * whose Clerk session is still alive — and that gate is stubbed out here so a
 * role failure cannot be confused for a status failure. Its own behaviour
 * (suspended → '/', lookup failure → '/', active → children) is covered by
 * `apps/web/app/admin/__tests__/layout.account-status.test.tsx`.
 *
 * The stub is NOT a silent no-op: the "admin" case below asserts the layout
 * still calls `assertAccountActive` with the signed-in id, so deleting the
 * status gate from layout.tsx fails this file too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoist all controllable mocks so vi.mock() factories can close over them,
// and mockReset: true resets only their recorded calls — not the hoisted refs.
// ---------------------------------------------------------------------------
const { mockGetUser, mockAuth, mockRedirect, mockAssertAccountActive, mockRequireCurrentTerms } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockAuth: vi.fn(),
    // redirect must be a vi.fn() so we can re-implement it in beforeEach after
    // mockReset: true clears the implementation that throws NEXT_REDIRECT.
    mockRedirect: vi.fn(),
    mockAssertAccountActive: vi.fn(),
    mockRequireCurrentTerms: vi.fn(),
  }));

// ---------------------------------------------------------------------------
// @clerk/nextjs/server
// ---------------------------------------------------------------------------
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  clerkClient: () =>
    Promise.resolve({
      users: {
        getUser: (id: string) => mockGetUser(id),
      },
    }),
}));

// ---------------------------------------------------------------------------
// next/navigation — delegate to mockRedirect so beforeEach can control behavior
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  redirect: (url: string): never => mockRedirect(url) as never,
  notFound: vi.fn(),
}));

// ---------------------------------------------------------------------------
// @/lib/api-auth — the account-status gate. The real `assertAccountActive`
// queries `profiles.account_status` through `getNeonDb()`, which has no
// connection string under vitest; it fails closed (503) and the layout would
// then redirect an ACTIVE admin to '/'. Stub it so this file measures role and
// nothing else. `server-only` is stubbed too because api-auth imports it.
// ---------------------------------------------------------------------------
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: (...args: unknown[]) => mockAssertAccountActive(...args),
}));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) => mockRequireCurrentTerms(...args),
}));

// ---------------------------------------------------------------------------
// Import the layout AFTER mocks are registered
// ---------------------------------------------------------------------------
const { default: AdminLayout } = await import('@/app/admin/layout');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Throws a NEXT_REDIRECT-style error, simulating Next.js redirect(). */
function throwingRedirect(url: string): never {
  const err = new Error('NEXT_REDIRECT');
  (err as unknown as Record<string, unknown>)['digest'] = `NEXT_REDIRECT;push;${url};307;`;
  throw err;
}

async function callLayout() {
  const children = React.createElement('div', null, 'admin content');
  return AdminLayout({ children });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminLayout — role gate', () => {
  beforeEach(() => {
    // mockReset: true clears implementations; re-establish all defaults here.
    mockAuth.mockResolvedValue({ userId: 'user-123' });
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: {} });
    // redirect() must throw so the layout short-circuits; re-establish after reset.
    mockRedirect.mockImplementation(throwingRedirect);
    // Default posture for this file: the account is active, so only role decides.
    mockAssertAccountActive.mockResolvedValue(undefined);
    mockRequireCurrentTerms.mockResolvedValue(undefined);
  });

  // --- Unauthenticated ---

  it('redirects to /login when the user is not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    // rejects.toThrow() without a string arg works reliably in this vitest version.
    // The redirect URL is verified via toHaveBeenCalledWith below.
    await expect(callLayout()).rejects.toThrow();
    expect(mockRedirect).toHaveBeenCalledWith('/login?redirectTo=/admin');
    // Should not reach clerkClient — short-circuits at the userId check
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  // --- Authenticated but insufficient role ---

  it('redirects to / when an authenticated user has no role in publicMetadata', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: {} });

    await expect(callLayout()).rejects.toThrow();
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('redirects to / when an authenticated user has role "member"', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: { role: 'member' } });

    await expect(callLayout()).rejects.toThrow();
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  it('redirects to / when an authenticated user has role "user"', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: { role: 'user' } });

    await expect(callLayout()).rejects.toThrow();
    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  // --- Authenticated with sufficient role (no redirect) ---

  it('allows access and returns children when publicMetadata.role is "admin"', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: { role: 'admin' } });
    // Make redirect a no-op so the layout can return children normally.
    mockRedirect.mockImplementation(() => undefined as never);

    const result = await callLayout();
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalledWith('/');
    // The role gate is not the only gate: prove the layout still runs the
    // CRIT-014 account-status read for the admin it just admitted. Without
    // this the stub above would hide the gate's removal entirely.
    expect(mockAssertAccountActive).toHaveBeenCalledWith('user-123');
    expect(mockRequireCurrentTerms).toHaveBeenCalledWith('user-123', '/admin');
  });

  it('allows access and returns children when publicMetadata.role is "owner"', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: { role: 'owner' } });
    mockRedirect.mockImplementation(() => undefined as never);

    const result = await callLayout();
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalledWith('/');
  });

  // --- Correct userId is passed to getUser ---

  it('calls getUser with the userId returned from auth()', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-abc' });
    mockGetUser.mockResolvedValue({ id: 'user-abc', publicMetadata: { role: 'admin' } });
    mockRedirect.mockImplementation(() => undefined as never);

    await callLayout();
    expect(mockGetUser).toHaveBeenCalledWith('user-abc');
  });
});
