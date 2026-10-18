import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from './authentication-store';
import type { AuthUser } from '@shared/services/authentication-manager';

const logoutStoreMocks = vi.hoisted(() => ({
  invalidateModelFavourites: vi.fn(),
  layoutReset: vi.fn(),
  artifactReset: vi.fn(),
}));

vi.mock('@shared/services/authentication-manager', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@shared/lib/logger', () => ({
  logger: {
    auth: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/features/chat/lib/use-model-favourites', () => ({
  invalidateModelFavouritesCache: logoutStoreMocks.invalidateModelFavourites,
}));

vi.mock('@/features/chat/stores/artifacts-store', () => ({
  useArtifactsStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ reset: logoutStoreMocks.artifactReset })),
  }),
}));

vi.mock('./layout-store', () => ({
  useLayoutStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ reset: logoutStoreMocks.layoutReset })),
  }),
}));
vi.mock('./web-chat-store', () => ({}));
vi.mock('./web-settings-store', () => ({}));
vi.mock('./media-store', () => ({}));
vi.mock('./model-store', () => ({}));
vi.mock('./thinking-store', () => ({}));
vi.mock('./tool-store', () => ({}));
vi.mock('@/features/chat/stores/voice-input-store', () => ({}));
vi.mock('@/features/chat/stores/style-store', () => ({}));
vi.mock('@/features/connectors/stores/tool-permissions-store', () => ({}));
vi.mock('@agiworkforce/unified-chat', () => ({}));

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Authentication Store', () => {
  let mockAuthService: typeof import('@shared/services/authentication-manager').authService;

  beforeEach(async () => {
    vi.clearAllMocks();

    useAuthStore.getState().reset();

    document.cookie = '__client_uat=9999999999';

    const authModule = await import('@shared/services/authentication-manager');
    mockAuthService = authModule.authService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should start with correct initial state', () => {
      useAuthStore.getState().reset();
      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
      expect(state.initialized).toBe(false);
    });
  });

  describe('Logout', () => {
    it('should logout and reset state', async () => {
      const mockUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        plan: 'free',
      };

      useAuthStore.getState().updateUser(mockUser);

      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      vi.mocked(mockAuthService.logout).mockResolvedValue({ error: null });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.initialized).toBe(false);
    });

    it('should cleanup other stores on logout', async () => {
      vi.mocked(mockAuthService.logout).mockResolvedValue({ error: null });

      await useAuthStore.getState().logout();

      expect(logoutStoreMocks.artifactReset).toHaveBeenCalled();
      expect(logoutStoreMocks.invalidateModelFavourites).toHaveBeenCalled();
    });

    it('cleans up the other stores even if one store fails during logout', async () => {
      const { useArtifactsStore } = await import('@/features/chat/stores/artifacts-store');
      const { logger } = await import('@shared/lib/logger');

      vi.mocked(useArtifactsStore.getState).mockImplementationOnce(() => {
        throw new Error('artifact store unavailable');
      });
      vi.mocked(mockAuthService.logout).mockResolvedValue({ error: null });

      await useAuthStore.getState().logout();

      expect(logoutStoreMocks.layoutReset).toHaveBeenCalled();
      expect(logoutStoreMocks.invalidateModelFavourites).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('artifacts-store'),
        expect.any(Error),
      );

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('Fetch User', () => {
    it('should fetch current user successfully', async () => {
      const mockUser: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        plan: 'pro',
      };

      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: mockUser,
        error: null,
      });

      await useAuthStore.getState().fetchUser();

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should handle fetch user error', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: null,
        error: 'Session expired',
      });

      await useAuthStore.getState().fetchUser();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('State Management Actions', () => {
    it('should update user directly', () => {
      const user: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        plan: 'free',
      };

      useAuthStore.getState().updateUser(user);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should reset state completely', () => {
      const user: AuthUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        plan: 'free',
      };

      useAuthStore.getState().updateUser(user);

      useAuthStore.getState().reset();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('calls getCurrentUser on first call', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          role: 'user',
          plan: 'free',
        },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(mockAuthService.getCurrentUser).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('user-1');
      expect(state.initialized).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('skips getCurrentUser when signed out (no Clerk session cookie)', async () => {
      document.cookie = '__client_uat=0';
      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'user', plan: 'free' },
        error: null,
      });

      await useAuthStore.getState().initialize();

      expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.initialized).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('short-circuits on second call (initialized guard)', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          role: 'user',
          plan: 'free',
        },
        error: null,
      });

      await useAuthStore.getState().initialize();
      vi.mocked(mockAuthService.getCurrentUser).mockClear();

      await useAuthStore.getState().initialize();

      expect(mockAuthService.getCurrentUser).not.toHaveBeenCalled();
    });

    it('concurrent calls do not double-init', async () => {
      let resolveAuth:
        ((value: { user: AuthUser | null; error: string | null }) => void) | undefined;
      vi.mocked(mockAuthService.getCurrentUser).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAuth = resolve;
          }),
      );

      const promise1 = useAuthStore.getState().initialize();
      const promise2 = useAuthStore.getState().initialize();

      resolveAuth!({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          role: 'user',
          plan: 'free',
        },
        error: null,
      });

      await Promise.all([promise1, promise2]);

      expect(mockAuthService.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().initialized).toBe(true);
    });

    it('sets initialized=true after success', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: null,
        error: null,
      });

      expect(useAuthStore.getState().initialized).toBe(false);

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().initialized).toBe(true);
    });

    it('handles auth error gracefully', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
        user: null,
        error: 'Session expired',
      });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('handles thrown exception gracefully', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockRejectedValue(new Error('Network failure'));

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('handles initialization timeout', async () => {
      vi.mocked(mockAuthService.getCurrentUser).mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      vi.useFakeTimers();

      const initPromise = useAuthStore.getState().initialize();

      await vi.advanceTimersByTimeAsync(6000);

      await initPromise;

      vi.useRealTimers();

      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null user in updateUser', () => {
      useAuthStore.getState().updateUser(null as unknown as AuthUser);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
