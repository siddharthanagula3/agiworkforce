import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@shared/lib/logger', () => ({
  logger: { auth: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

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
vi.mock('@/features/chat/stores/voice-session-store', () => ({}));
vi.mock('@/features/chat/stores/style-store', () => ({}));
vi.mock('@/features/connectors/stores/tool-permissions-store', () => ({}));
vi.mock('@/features/chat/lib/use-model-favourites', () => ({}));
vi.mock('@/features/connectors/hooks/use-connectors', () => ({}));
vi.mock('@/features/connectors/hooks/use-connector-capabilities', () => ({}));
vi.mock('@agiworkforce/unified-chat', () => ({}));

import { cleanupAllStores } from './authentication-store';
import { authService } from '@shared/services/authentication-manager';
import { FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY } from '@/features/chat/components/FreePlanTrainingNotice';

describe('sign-out storage sweep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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

  // Fails before TC-01: the agi. prefix swept the notice keys with everything
  // else, so a dismissed notice came back after every sign-out.
  it('keeps the notices this browser dismissed and still clears the account keys', async () => {
    localStorage.setItem(FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY, 'user_1');
    localStorage.setItem('agi.notice.free-model-promotion.model-a.2026-10-25', 'user_1');
    localStorage.setItem('agi-user-profile-store', '{"name":"Ada"}');
    localStorage.setItem('agiworkforce-web-chat', '{"selectedModelId":"model-a"}');
    localStorage.setItem('agi_last_activity', '1760000000000');
    localStorage.setItem('agi.privacy.shareTelemetry', 'true');
    sessionStorage.setItem('agi.project.pendingHandoff.v1', '{"content":"draft"}');

    await cleanupAllStores();

    expect(localStorage.getItem(FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY)).toBe('user_1');
    expect(localStorage.getItem('agi.notice.free-model-promotion.model-a.2026-10-25')).toBe(
      'user_1',
    );
    expect(localStorage.getItem('agi-user-profile-store')).toBeNull();
    expect(localStorage.getItem('agiworkforce-web-chat')).toBeNull();
    expect(localStorage.getItem('agi_last_activity')).toBeNull();
    expect(localStorage.getItem('agi.privacy.shareTelemetry')).toBeNull();
    expect(sessionStorage.getItem('agi.project.pendingHandoff.v1')).toBeNull();
  });

  it('still clears a key that only starts like a notice', async () => {
    localStorage.setItem('agi.notices', 'not a dismissal');
    localStorage.setItem('agi-notice.free-plan-training', 'not a dismissal');

    await cleanupAllStores();

    expect(localStorage.getItem('agi.notices')).toBeNull();
    expect(localStorage.getItem('agi-notice.free-plan-training')).toBeNull();
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
