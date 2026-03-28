import { beforeEach, describe, expect, it, vi } from 'vitest';

const getStateMock = vi.fn();

vi.mock('@/stores/unified/auth', () => ({
  useBillingStore: {
    getState: getStateMock,
  },
}));

describe('supabaseAuth compatibility facade', () => {
  beforeEach(() => {
    vi.resetModules();
    getStateMock.mockReset();
  });

  it('returns the current user synchronously from the auth store', async () => {
    const user = { id: 'user-123', email: 'ship@example.com' };
    getStateMock.mockReturnValue({
      user,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });

    const { supabaseAuth } = await import('../supabaseAuth');

    expect(supabaseAuth.getUser()).toEqual(user);
  });

  it('returns null when no authenticated user is cached', async () => {
    getStateMock.mockReturnValue({
      user: null,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });

    const { supabaseAuth } = await import('../supabaseAuth');

    expect(supabaseAuth.getUser()).toBeNull();
  });
});
