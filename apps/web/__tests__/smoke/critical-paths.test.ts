/**
 * E2E Smoke Tests — Critical User Paths
 *
 * These tests verify the most important user flows work end-to-end
 * through the store/service layer. They catch integration breakages
 * that unit tests on individual stores would miss.
 *
 * Covered flows:
 *   1. Auth: login -> state update -> logout -> state reset
 *   2. Auth: registration with validation
 *   3. Chat: create session -> send message -> session dedup guard
 *   4. Chat: message streaming lifecycle
 *   5. Chat: Supabase persistence round-trip
 *   6. Settings: profile validation with XSS sanitization
 *   7. Settings: password strength enforcement
 *   8. Layout: sidebar + modal state management
 *   9. Chat: session deletion cascades messages
 *  10. Auth: concurrent init deduplication
 *  11. Chat: auto-title from first user message
 *  12. Settings: notification preferences validation
 *  13. Auth: error recovery after failed login
 *  14. Chat: clear session resets messageCount and preview
 *  15. Layout: theme management
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// ─── Auth Store Mocks ───────────────────────────────────────────────────────

vi.mock('@core/auth/authentication-manager', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    changePassword: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

vi.mock('@shared/lib/logger', () => ({
  logger: {
    auth: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@shared/stores/workforce-store', () => ({
  useWorkforceStore: { getState: vi.fn(() => ({ reset: vi.fn() })) },
  cleanupWorkforceSubscription: vi.fn(),
}));

vi.mock('@shared/stores/mission-control-store', () => ({
  useMissionStore: { getState: vi.fn(() => ({ reset: vi.fn() })) },
  stopMissionCleanupInterval: vi.fn(),
}));

vi.mock('@shared/stores/notification-store', () => ({
  useNotificationStore: { getState: vi.fn(() => ({ clearAll: vi.fn() })) },
}));

vi.mock('@shared/stores/chat-store', () => ({
  useChatStore: { getState: vi.fn(() => ({ clearHistory: vi.fn() })) },
}));

vi.mock('@shared/stores/multi-agent-chat-store', () => ({
  useMultiAgentChatStore: { getState: vi.fn(() => ({ reset: vi.fn() })) },
}));

vi.mock('@shared/stores/usage-warning-store', () => ({
  useUsageWarningStore: { getState: vi.fn(() => ({ resetWarnings: vi.fn() })) },
}));

vi.mock('@shared/stores/artifact-store', () => ({
  useArtifactStore: { getState: vi.fn(() => ({ clearAllArtifacts: vi.fn() })) },
}));

// Mock supabase-client for chat store tests
vi.mock('@shared/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  },
}));

import { useAuthStore } from '@shared/stores/authentication-store';
import type { AuthUser } from '@core/auth/authentication-manager';

// ─── Smoke Tests: Auth ──────────────────────────────────────────────────────

describe('Smoke: Auth Flow', () => {
  let mockAuthService: typeof import('@core/auth/authentication-manager').authService;

  const testUser: AuthUser = {
    id: 'smoke-user-1',
    email: 'smoke@test.com',
    name: 'Smoke Tester',
    role: 'user',
    plan: 'pro',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    useAuthStore.getState().reset();
    const mod = await import('@core/auth/authentication-manager');
    mockAuthService = mod.authService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. login -> authenticated state -> logout -> reset', async () => {
    vi.mocked(mockAuthService.login).mockResolvedValue({ user: testUser, error: null });
    vi.mocked(mockAuthService.logout).mockResolvedValue({ error: null });

    // Login
    const loginResult = await useAuthStore.getState().login({
      email: 'smoke@test.com',
      password: 'Password123!',
    });
    expect(loginResult.success).toBe(true);

    // Verify authenticated state
    let state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('smoke-user-1');
    expect(state.user?.plan).toBe('pro');
    expect(state.isLoading).toBe(false);

    // Logout
    await useAuthStore.getState().logout();

    // Verify full reset
    state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('2. registration sets authenticated state', async () => {
    vi.mocked(mockAuthService.register).mockResolvedValue({ user: testUser, error: null });

    const result = await useAuthStore.getState().register({
      email: 'smoke@test.com',
      password: 'SecurePass123!',
      name: 'Smoke Tester',
    });

    expect(result.success).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.email).toBe('smoke@test.com');
  });

  it('10. concurrent init calls deduplicate (only one getCurrentUser call)', async () => {
    vi.mocked(mockAuthService.getCurrentUser).mockResolvedValue({
      user: testUser,
      error: null,
    });

    await Promise.all([useAuthStore.getState().initialize(), useAuthStore.getState().initialize()]);

    expect(mockAuthService.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().initialized).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('13. error recovery: failed login followed by successful login', async () => {
    // First attempt fails
    vi.mocked(mockAuthService.login).mockResolvedValue({
      user: null,
      error: 'Invalid credentials',
    });

    const failResult = await useAuthStore.getState().login({
      email: 'smoke@test.com',
      password: 'wrong',
    });
    expect(failResult.success).toBe(false);
    expect(useAuthStore.getState().error).toBe('Invalid credentials');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    // Second attempt succeeds
    vi.mocked(mockAuthService.login).mockResolvedValue({
      user: testUser,
      error: null,
    });

    const successResult = await useAuthStore.getState().login({
      email: 'smoke@test.com',
      password: 'Password123!',
    });
    expect(successResult.success).toBe(true);
    expect(useAuthStore.getState().error).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('smoke-user-1');
  });
});

// ─── Smoke Tests: Chat ──────────────────────────────────────────────────────

describe('Smoke: Chat Session Flow', () => {
  // Use dynamic import to get the features chat store (not the shared mock)
  async function getChatStore() {
    const { useChatStore } = await import('@features/chat/stores/chat-store');
    useChatStore.getState().reset();
    // Advance past debounce window (500ms guard in createSession)
    vi.advanceTimersByTime(1500);
    return useChatStore;
  }

  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('3. create session -> send message -> session dedup guard', async () => {
    const store = await getChatStore();

    // Create first session
    const sessionId = store.getState().createSession();
    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().activeSessionId).toBe(sessionId);

    // Send a message
    const msgId = store.getState().addMessage(sessionId, {
      role: 'user',
      content: 'Hello, this is a smoke test',
    });
    expect(msgId).toBeTruthy();
    expect(store.getState().messages[sessionId]).toHaveLength(1);

    // Create second session (should be distinct — advance past debounce)
    vi.advanceTimersByTime(1500);
    const sessionId2 = store.getState().createSession();
    expect(sessionId2).not.toBe(sessionId);
    expect(store.getState().sessions).toHaveLength(2);
  });

  it('4. message streaming lifecycle: create -> stream -> finalize', async () => {
    const store = await getChatStore();
    const sessionId = store.getState().createSession();

    // Start streaming assistant message
    const msgId = store.getState().addMessage(sessionId, {
      role: 'assistant',
      content: '',
    });

    store.getState().setStreaming(sessionId, msgId, true);
    let msg = store.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
    expect(msg.isStreaming).toBe(true);

    // Stream chunks
    store.getState().appendToMessage(sessionId, msgId, 'Hello');
    store.getState().appendToMessage(sessionId, msgId, ' world');

    // Finalize
    store.getState().setStreaming(sessionId, msgId, false);
    msg = store.getState().messages[sessionId]!.find((m) => m.id === msgId)!;
    expect(msg.isStreaming).toBe(false);
    expect(msg.content).toBe('Hello world');
  });

  it('5. Supabase persistence: saveSessionToDb calls upsert correctly', async () => {
    const store = await getChatStore();
    const { supabase } = await import('@shared/lib/supabase-client');

    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({
      upsert: upsertMock,
    } as unknown as ReturnType<typeof supabase.from>);

    const now = new Date('2026-03-04T12:00:00Z');
    await store.getState().saveSessionToDb(
      {
        id: 'smoke-session',
        title: 'Smoke Test Chat',
        createdAt: now,
        updatedAt: now,
        preview: 'hello',
        messageCount: 1,
      },
      'smoke-user',
    );

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'smoke-session',
        user_id: 'smoke-user',
        title: 'Smoke Test Chat',
        preview: 'hello',
        message_count: 1,
      }),
    );
  });

  it('9. session deletion cascades: removes messages and updates active', async () => {
    const store = await getChatStore();

    const id1 = store.getState().createSession();
    store.getState().addMessage(id1, { role: 'user', content: 'msg in session 1' });

    vi.advanceTimersByTime(1500); // bypass debounce
    const id2 = store.getState().createSession();
    store.getState().addMessage(id2, { role: 'user', content: 'msg in session 2' });

    // Delete active session (id2)
    store.getState().deleteSession(id2);

    // Messages cleaned up
    expect(store.getState().messages[id2]).toBeUndefined();

    // Falls back to remaining session
    expect(store.getState().activeSessionId).toBe(id1);
    expect(store.getState().sessions).toHaveLength(1);

    // Session 1 messages intact
    expect(store.getState().messages[id1]).toHaveLength(1);
  });

  it('11. auto-title from first user message', async () => {
    const store = await getChatStore();
    const sessionId = store.getState().createSession();

    expect(store.getState().sessions.find((s) => s.id === sessionId)?.title).toBe('New Chat');

    store.getState().addMessage(sessionId, {
      role: 'user',
      content: 'How do I deploy a Rust application to production?',
    });

    const updated = store.getState().sessions.find((s) => s.id === sessionId);
    expect(updated?.title).toContain('How do I deploy');
    expect(updated?.title).not.toBe('New Chat');
  });

  it('14. clearSession resets messageCount and preview', async () => {
    const store = await getChatStore();
    const sessionId = store.getState().createSession();

    store.getState().addMessage(sessionId, { role: 'user', content: 'Hello world' });
    store.getState().addMessage(sessionId, { role: 'assistant', content: 'Hi there' });

    const before = store.getState().sessions.find((s) => s.id === sessionId);
    expect(before?.messageCount).toBe(2);

    store.getState().clearSession(sessionId);

    const after = store.getState().sessions.find((s) => s.id === sessionId);
    expect(after?.messageCount).toBe(0);
    expect(after?.preview).toBe('');
    expect(store.getState().messages[sessionId]).toHaveLength(0);
  });
});

// ─── Smoke Tests: Settings Validation ───────────────────────────────────────

describe('Smoke: Settings Validation', () => {
  it('6. profile validation rejects XSS and enforces constraints', async () => {
    const { profileSettingsSchema } =
      await import('@features/settings/schemas/settings-validation');

    // Valid profile passes
    const valid = profileSettingsSchema.safeParse({
      name: 'Smoke Tester',
      timezone: 'America/New_York',
      language: 'en',
    });
    expect(valid.success).toBe(true);

    // XSS is sanitized (not rejected)
    const xss = profileSettingsSchema.safeParse({
      name: '<script>alert("xss")</script>Valid Name',
      timezone: 'America/New_York',
      language: 'en',
    });
    expect(xss.success).toBe(true);
    if (xss.success) {
      expect(xss.data.name).not.toContain('<script>');
    }

    // Empty name rejected
    const empty = profileSettingsSchema.safeParse({
      name: '',
      timezone: 'America/New_York',
      language: 'en',
    });
    expect(empty.success).toBe(false);
  });

  it('7. password schema enforces strength requirements', async () => {
    const { changePasswordSchema } = await import('@features/settings/schemas/settings-validation');

    // Strong password passes
    const strong = changePasswordSchema.safeParse({
      newPassword: 'Sm0keTest!ng',
      confirmPassword: 'Sm0keTest!ng',
    });
    expect(strong.success).toBe(true);

    // Weak password (no special char) fails
    const weak = changePasswordSchema.safeParse({
      newPassword: 'SmokeTest123',
      confirmPassword: 'SmokeTest123',
    });
    expect(weak.success).toBe(false);

    // Mismatched passwords fail
    const mismatch = changePasswordSchema.safeParse({
      newPassword: 'Sm0keTest!ng',
      confirmPassword: 'Different!23',
    });
    expect(mismatch.success).toBe(false);
  });

  it('12. notification preferences accepts valid boolean map', async () => {
    const { notificationPreferencesSchema } =
      await import('@features/settings/schemas/settings-validation');

    const valid = notificationPreferencesSchema.safeParse({
      email_notifications: true,
      push_notifications: false,
      workflow_alerts: true,
      employee_updates: true,
      system_maintenance: true,
      marketing_emails: false,
      weekly_reports: true,
      instant_alerts: true,
    });
    expect(valid.success).toBe(true);

    // Non-boolean value rejected
    const invalid = notificationPreferencesSchema.safeParse({
      email_notifications: 'yes',
      push_notifications: false,
      workflow_alerts: true,
      employee_updates: true,
      system_maintenance: true,
      marketing_emails: false,
      weekly_reports: true,
      instant_alerts: true,
    });
    expect(invalid.success).toBe(false);
  });
});

// ─── Smoke Tests: Layout Store ──────────────────────────────────────────────

describe('Smoke: Layout Store', () => {
  it('8. sidebar + modal state management', async () => {
    const { useUIStore } = await import('@shared/stores/layout-store');
    useUIStore.getState().reset();

    // Initial state
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    expect(useUIStore.getState().modals.settings).toBe(false);

    // Toggle sidebar
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);

    // Open settings modal
    useUIStore.getState().openModal('settings');
    expect(useUIStore.getState().modals.settings).toBe(true);

    // Close settings modal
    useUIStore.getState().closeModal('settings');
    expect(useUIStore.getState().modals.settings).toBe(false);

    // Reset brings everything back
    useUIStore.getState().reset();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it('15. theme management persists across toggles', async () => {
    const { useUIStore } = await import('@shared/stores/layout-store');
    useUIStore.getState().reset();

    // Default theme
    expect(useUIStore.getState().theme).toBe('system');

    // Set to dark
    useUIStore.getState().setTheme('dark');
    expect(useUIStore.getState().theme).toBe('dark');

    // Set to light
    useUIStore.getState().setTheme('light');
    expect(useUIStore.getState().theme).toBe('light');

    // Reset returns to system
    useUIStore.getState().reset();
    expect(useUIStore.getState().theme).toBe('system');
  });
});
