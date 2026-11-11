import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@shared/lib/logger', () => ({
  logger: { auth: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const publicationCleanupMocks = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('./layout-store', () => ({
  useLayoutStore: { getState: () => ({ reset: publicationCleanupMocks.reset }) },
}));
vi.mock('./web-chat-store', () => ({}));
vi.mock('./web-settings-store', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
}));
vi.mock('./model-store', () => ({}));
vi.mock('./thinking-store', () => ({}));
vi.mock('@/features/chat/stores/artifacts-store', () => ({}));
vi.mock('@/features/chat/stores/voice-input-store', () => ({}));
vi.mock('@/features/chat/stores/voice-session-store', () => ({}));
vi.mock('@/features/chat/stores/style-store', () => ({}));
vi.mock('@/features/connectors/stores/tool-permissions-store', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
}));
vi.mock('@/features/chat/lib/use-model-favourites', () => ({}));
vi.mock('@/features/connectors/hooks/use-connectors', () => ({}));
vi.mock('@/features/connectors/hooks/use-connector-capabilities', () => ({}));
vi.mock('@agiworkforce/unified-chat', () => ({}));

import { cleanupAllStores, useAuthStore } from './authentication-store';
import { useMediaStore } from './media-store';
import { authService } from '@shared/services/authentication-manager';
import { FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY } from '@/features/chat/components/FreePlanTrainingNotice';

import {
  beginPublicationCleanup,
  capturePublicationLease,
  isPublicationLeaseCurrent,
  usePublishedSitesStore,
} from '@/features/sites/stores/published-sites-store';

function openPublicationLease() {
  const lease = capturePublicationLease();
  if (!lease) throw new Error('Expected publication cleanup to have completed');
  return lease;
}

const publicationDetails = {
  shareUrl: 'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
  visibility: 'public' as const,
};

const mediaOwner = {
  userId: 'media-user',
  sessionId: 'media-session',
  isCurrent: () => true,
  getToken: async () => 'media-token',
};

describe('sign-out storage sweep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useMediaStore.getState().reset();
  });

  it('clears actual media jobs and refuses resurrection by a late update', async () => {
    const original = {
      id: 'old-media-job',
      type: 'image' as const,
      prompt: 'private old prompt',
      status: 'generating' as const,
      createdAt: '2026-11-04T00:00:00.000Z',
    };
    for (const status of ['pending', 'generating', 'completed', 'failed'] as const) {
      useMediaStore.getState().addJob(
        {
          ...original,
          id: `${original.id}-${status}`,
          status,
          resultUrl: '/old-result',
          errorMessage: 'old failure',
        },
        mediaOwner,
      );
    }
    useMediaStore.getState().addJob(original, mediaOwner);
    await cleanupAllStores();
    expect(useMediaStore.getState().jobs).toEqual([]);

    useMediaStore
      .getState()
      .addJob({ ...original, id: 'new-media-job', prompt: 'new prompt' }, mediaOwner);
    useMediaStore
      .getState()
      .updateJob(original.id, { status: 'completed', resultUrl: '/old-image' });
    expect(useMediaStore.getState().jobs).toEqual([
      { ...original, id: 'new-media-job', prompt: 'new prompt', owner: mediaOwner },
    ]);
    expect(useMediaStore.getState().reset).toEqual(expect.any(Function));
  });

  it('synchronously clears media on cookie-absence resync without retiring SDK authority', async () => {
    document.cookie = '__client_uat=; Max-Age=0; path=/';
    document.cookie = '__session=; Max-Age=0; path=/';
    useAuthStore.getState().reset();
    const job = {
      id: 'old-media-job',
      type: 'image' as const,
      prompt: 'old prompt',
      status: 'generating' as const,
      createdAt: '2026-11-04T00:00:00.000Z',
    };
    useMediaStore.getState().addJob(job, mediaOwner);

    const resync = useAuthStore.getState().resyncSession();
    expect(useMediaStore.getState().jobs).toEqual([]);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mediaOwner.isCurrent()).toBe(true);
    useMediaStore.getState().addJob({ ...job, id: 'replacement' }, mediaOwner);
    await resync;
    useMediaStore.getState().updateJob(job.id, { status: 'completed', resultUrl: '/old-result' });
    expect(useMediaStore.getState().jobs).toEqual([
      { ...job, id: 'replacement', owner: mediaOwner },
    ]);
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

  it('ends only the named session when one is given', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Record<string, unknown>)['Clerk'] = { signOut };

    await authService.logout({ sessionId: 'session-a' });

    expect(signOut).toHaveBeenCalledWith({ sessionId: 'session-a' });
  });

  it('reports a session as superseded only when a different session is active', () => {
    const clerk = (session: { id: string } | null) => {
      (window as unknown as Record<string, unknown>)['Clerk'] = { session };
    };

    clerk({ id: 'session-a' });
    expect(authService.isSessionSuperseded('session-a')).toBe(false);
    clerk(null);
    expect(authService.isSessionSuperseded('session-a')).toBe(false);
    clerk({ id: 'session-b' });
    expect(authService.isSessionSuperseded('session-a')).toBe(true);
  });

  it('leaves a replacement session and its local state alone', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Record<string, unknown>)['Clerk'] = {
      signOut,
      session: { id: 'session-b' },
    };
    localStorage.setItem('agi-user-profile-store', '{"name":"Grace"}');

    await useAuthStore.getState().logout({ sessionId: 'session-a' });

    expect(signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem('agi-user-profile-store')).toBe('{"name":"Grace"}');
    localStorage.clear();
  });
});

describe('common cleanup publication boundary', () => {
  beforeEach(() => {
    publicationCleanupMocks.reset.mockReset();
    beginPublicationCleanup()();
  });

  afterEach(() => {
    publicationCleanupMocks.reset.mockReset();
    beginPublicationCleanup()();
  });

  it.each(['success', 'failure'] as const)(
    'clears before its first await and stays closed during a %s module cleanup and its microtasks',
    async (outcome) => {
      const lease = openPublicationLease();
      usePublishedSitesStore.getState().record('private-artifact', publicationDetails, lease);
      const observed: Array<{
        lease: ReturnType<typeof capturePublicationLease>;
        accepted: boolean;
      }> = [];
      const observe = () =>
        observed.push({
          lease: capturePublicationLease(),
          accepted: usePublishedSitesStore
            .getState()
            .record('late-artifact', publicationDetails, lease),
        });
      let deferredObservation: Promise<void> | undefined;
      publicationCleanupMocks.reset.mockImplementation(() => {
        observe();
        deferredObservation = Promise.resolve().then(() => {
          observe();
        });
        if (outcome === 'failure') throw new Error('Fixture store reset failed');
        return deferredObservation;
      });
      const cleaning = cleanupAllStores();
      try {
        expect(capturePublicationLease()).toBeNull();
        expect(isPublicationLeaseCurrent(lease)).toBe(false);
        expect(usePublishedSitesStore.getState()).toMatchObject({
          byArtifactId: {},
          status: 'idle',
        });
        expect(usePublishedSitesStore.getState().hydrate([], lease)).toBe(false);
        expect(usePublishedSitesStore.getState().forget('private-artifact', lease)).toBe(false);
        await cleaning;
        await deferredObservation;
        expect(publicationCleanupMocks.reset).toHaveBeenCalledTimes(1);
        expect(observed).toEqual([
          { lease: null, accepted: false },
          { lease: null, accepted: false },
        ]);
        const reopened = openPublicationLease();
        expect(reopened).not.toBe(lease);
        expect(
          usePublishedSitesStore.getState().record('late-artifact', publicationDetails, lease),
        ).toBe(false);
        expect(
          usePublishedSitesStore.getState().record('fresh-artifact', publicationDetails, reopened),
        ).toBe(true);
        expect(Object.keys(usePublishedSitesStore.getState().byArtifactId)).toEqual([
          'fresh-artifact',
        ]);
      } finally {
        await cleaning;
        await deferredObservation;
      }
    },
  );

  it('does not reopen the common boundary while another cleanup remains active', async () => {
    const lease = openPublicationLease();
    let nestedFinish: (() => void) | undefined;
    publicationCleanupMocks.reset.mockImplementation(() => {
      nestedFinish = beginPublicationCleanup();
    });
    const cleaning = cleanupAllStores();
    try {
      expect(capturePublicationLease()).toBeNull();
      await cleaning;
      expect(capturePublicationLease()).toBeNull();
      expect(
        usePublishedSitesStore.getState().record('late-artifact', publicationDetails, lease),
      ).toBe(false);
      if (!nestedFinish) throw new Error('Nested cleanup did not start');
      nestedFinish();
      const reopened = openPublicationLease();
      nestedFinish();
      expect(openPublicationLease()).toBe(reopened);
    } finally {
      await cleaning;
      nestedFinish?.();
    }
  });
});

type ImportedModule1 = typeof import('./web-settings-store');
type ImportedModule0 = typeof import('@/features/connectors/stores/tool-permissions-store');
