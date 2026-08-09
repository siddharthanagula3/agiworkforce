/**
 * Sign-out must leave nothing behind: neither the Clerk session that would
 * silently sign the user back in, nor the token material the legacy
 * `APIClient` persisted to localStorage.
 *
 * Kept out of authentication-store.test.ts because that file replaces
 * `window.localStorage` with a bare vi.fn() double that has no `length`/`key`,
 * which is exactly the surface the storage sweep walks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@shared/lib/logger', () => ({
  logger: { auth: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// The cleanup registry deliberately imports every user-scoped store; none of
// them are collaborators of this test.
vi.mock('./mission-control-store', () => ({}));
vi.mock('./notification-store', () => ({}));
vi.mock('./artifact-store', () => ({}));
vi.mock('./layout-store', () => ({}));
vi.mock('./user-profile-store', () => ({}));
vi.mock('./web-chat-store', () => ({}));
vi.mock('./web-settings-store', () => ({}));
vi.mock('./media-store', () => ({}));
vi.mock('./model-store', () => ({}));
vi.mock('./thinking-store', () => ({}));
vi.mock('./tool-store', () => ({}));
vi.mock('./agent-metrics-store', () => ({}));
vi.mock('./company-hub-store', () => ({}));
vi.mock('@/features/chat/stores/artifacts-store', () => ({}));
vi.mock('@/features/chat/stores/voice-input-store', () => ({}));
vi.mock('@/features/chat/stores/style-store', () => ({}));
vi.mock('@/features/plugins/stores/plugin-store', () => ({}));
vi.mock('@/features/connectors/stores/tool-permissions-store', () => ({}));
vi.mock('@agiworkforce/unified-chat', () => ({}));

import { cleanupAllStores } from './authentication-store';
import { authService } from '@shared/services/authentication-manager';

describe('sign-out storage sweep', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes the legacy APIClient bearer and refresh tokens', async () => {
    localStorage.setItem('auth_token', 'encrypted-access');
    localStorage.setItem('refresh_token', 'encrypted-refresh');

    await cleanupAllStores();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('leaves storage this app does not own alone', async () => {
    localStorage.setItem('theme-preference', 'dark');

    await cleanupAllStores();

    expect(localStorage.getItem('theme-preference')).toBe('dark');
  });
});

describe('authService.logout', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['Clerk'];
  });

  it('ends the Clerk session', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Record<string, unknown>)['Clerk'] = { signOut };

    await expect(authService.logout()).resolves.toEqual({ error: null });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('reports a failed Clerk sign-out instead of claiming success', async () => {
    (window as unknown as Record<string, unknown>)['Clerk'] = {
      signOut: vi.fn().mockRejectedValue(new Error('network down')),
    };

    await expect(authService.logout()).resolves.toEqual({ error: 'network down' });
  });

  it('is a no-op when Clerk has not loaded', async () => {
    await expect(authService.logout()).resolves.toEqual({ error: null });
  });
});
