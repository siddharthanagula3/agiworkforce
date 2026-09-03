import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const { mockGetUser, mockAuth, mockRedirect, mockAssertAccountActive, mockRequireCurrentTerms } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockAuth: vi.fn(),
    mockRedirect: vi.fn(),
    mockAssertAccountActive: vi.fn(),
    mockRequireCurrentTerms: vi.fn(),
  }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  clerkClient: () =>
    Promise.resolve({
      users: {
        getUser: (id: string) => mockGetUser(id),
      },
    }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => mockRedirect(url) as never,
  notFound: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: (...args: unknown[]) => mockAssertAccountActive(...args),
}));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) => mockRequireCurrentTerms(...args),
}));

const { default: AdminLayout } = await import('@/app/admin/layout');

function throwingRedirect(url: string): never {
  const err = new Error('NEXT_REDIRECT');
  (err as unknown as Record<string, unknown>)['digest'] = `NEXT_REDIRECT;push;${url};307;`;
  throw err;
}

async function callLayout() {
  const children = React.createElement('div', null, 'admin content');
  return AdminLayout({ children });
}

describe('AdminLayout, role gate', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user-123' });
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: {} });
    mockRedirect.mockImplementation(throwingRedirect);
    mockAssertAccountActive.mockResolvedValue(undefined);
    mockRequireCurrentTerms.mockResolvedValue(undefined);
  });

  it('redirects to /login when the user is not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(callLayout()).rejects.toThrow();
    expect(mockRedirect).toHaveBeenCalledWith('/login?redirectTo=/admin');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

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

  it('allows access and returns children when publicMetadata.role is "admin"', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-123', publicMetadata: { role: 'admin' } });
    mockRedirect.mockImplementation(() => undefined as never);

    const result = await callLayout();
    expect(result).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalledWith('/');
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

  it('calls getUser with the userId returned from auth()', async () => {
    mockAuth.mockResolvedValue({ userId: 'user-abc' });
    mockGetUser.mockResolvedValue({ id: 'user-abc', publicMetadata: { role: 'admin' } });
    mockRedirect.mockImplementation(() => undefined as never);

    await callLayout();
    expect(mockGetUser).toHaveBeenCalledWith('user-abc');
  });
});
