/**
 * heartbeat.ts unit tests
 *
 * Covers:
 * - Auth check: sendHeartbeat skips the upsert when getSession returns no
 *   access_token (unauthenticated / device-link only user)
 * - Auth check: sendHeartbeat calls upsert when a valid session exists
 * - startDesktopHeartbeat: calls sendHeartbeat immediately on start
 * - startDesktopHeartbeat: cleanup function clears the interval so no further
 *   heartbeats fire after it is called
 * - startDesktopHeartbeat: skips heartbeat when document.visibilityState is hidden
 * - startDesktopHeartbeat: fires a heartbeat when document becomes visible again
 * - Errors inside sendHeartbeat are swallowed (non-fatal)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be registered before the module under test is imported.
// vi.mock() paths are resolved relative to the TEST FILE location:
//   test: src/services/__tests__/heartbeat.test.ts
//   target: src/lib/supabase  →  ../../lib/supabase
// ---------------------------------------------------------------------------

const mockUpsert = vi.fn();
const mockFromFn = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../lib/supabase', () => ({
  getSupabase: vi.fn(() => ({
    auth: { getSession: mockGetSession },
    from: mockFromFn,
  })),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are registered
// ---------------------------------------------------------------------------

import { startDesktopHeartbeat } from '../heartbeat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all pending microtasks by awaiting several rounds of Promise.resolve(). */
async function flushPromises(): Promise<void> {
  // heartbeat's async chain: getSession → if check → from().upsert()
  // Each await point needs one round, so 8 rounds is more than enough.
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

function setVisible() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
}

function setHidden() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
}

function triggerVisibilityChange(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** A valid authenticated session response. */
const VALID_SESSION = {
  data: { session: { access_token: 'valid-token-abc' } },
};

// ---------------------------------------------------------------------------
// Test suite 1 — auth check (the P0 guard)
// ---------------------------------------------------------------------------

describe('heartbeat — auth check prevents unauthenticated upserts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisible();
    // Re-set mock implementations after clearAllMocks (which clears implementations
    // set via mockReturnValue / mockResolvedValue, but NOT the vi.mock factory impl).
    mockUpsert.mockResolvedValue({ error: null });
    mockFromFn.mockReturnValue({ upsert: mockUpsert });
    mockGetSession.mockResolvedValue(VALID_SESSION);
  });

  afterEach(() => {
    setVisible();
  });

  it('does NOT call upsert when getSession returns no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const cleanup = startDesktopHeartbeat('user-no-session');
    await flushPromises();

    expect(mockUpsert).not.toHaveBeenCalled();
    cleanup();
  });

  it('does NOT call upsert when access_token is an empty string', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: '' } } });

    const cleanup = startDesktopHeartbeat('user-empty-token');
    await flushPromises();

    expect(mockUpsert).not.toHaveBeenCalled();
    cleanup();
  });

  it('does NOT call upsert when access_token is undefined', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: undefined } } });

    const cleanup = startDesktopHeartbeat('user-undef-token');
    await flushPromises();

    expect(mockUpsert).not.toHaveBeenCalled();
    cleanup();
  });

  it('does NOT call upsert when the session object is undefined', async () => {
    mockGetSession.mockResolvedValue({ data: { session: undefined } });

    const cleanup = startDesktopHeartbeat('user-no-session-obj');
    await flushPromises();

    expect(mockUpsert).not.toHaveBeenCalled();
    cleanup();
  });

  it('does NOT call upsert when data is undefined', async () => {
    mockGetSession.mockResolvedValue({ data: undefined });

    const cleanup = startDesktopHeartbeat('user-no-data');
    await flushPromises();

    expect(mockUpsert).not.toHaveBeenCalled();
    cleanup();
  });

  it('DOES call upsert when a valid session with access_token exists', async () => {
    const cleanup = startDesktopHeartbeat('user-authenticated');
    await flushPromises();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-authenticated',
        surface_id: 'desktop',
      }),
      expect.objectContaining({ onConflict: 'user_id,surface_id' }),
    );

    cleanup();
  });

  it('upsert payload includes last_seen_at as a valid ISO date string', async () => {
    const before = Date.now();

    const cleanup = startDesktopHeartbeat('user-ts-check');
    await flushPromises();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const payload = mockUpsert.mock.calls[0]?.[0] as { last_seen_at: string };
    const ts = new Date(payload.last_seen_at).getTime();
    expect(isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before);

    cleanup();
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — lifecycle with fake timers
// NOTE: vi.runAllTimersAsync() causes infinite loop because of setInterval.
// Instead we use vi.advanceTimersByTimeAsync() or advanceTimersByTime() to
// control exactly how far time advances.
// ---------------------------------------------------------------------------

describe('heartbeat — startDesktopHeartbeat lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisible();
    vi.useFakeTimers();
    mockUpsert.mockResolvedValue({ error: null });
    mockFromFn.mockReturnValue({ upsert: mockUpsert });
    mockGetSession.mockResolvedValue(VALID_SESSION);
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisible();
  });

  it('calls sendHeartbeat immediately on start before any interval fires', async () => {
    const cleanup = startDesktopHeartbeat('user-immed');

    // Flush microtasks without advancing timers — the immediate call is not timer-driven
    await flushPromises();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('cleanup cancels the interval so no more heartbeats fire after cleanup', async () => {
    const cleanup = startDesktopHeartbeat('user-cleanup');

    // Flush the immediate call
    await flushPromises();
    const callsAfterInit = mockUpsert.mock.calls.length;

    cleanup();

    // Advance well past multiple 60s intervals — no additional calls should occur
    vi.advanceTimersByTime(180_000);
    await flushPromises();

    expect(mockUpsert.mock.calls.length).toBe(callsAfterInit);
  });

  it('does not send a heartbeat when document is hidden at the interval tick', async () => {
    const cleanup = startDesktopHeartbeat('user-hidden');
    await flushPromises();

    const callsAfterInit = mockUpsert.mock.calls.length;

    setHidden();

    // Advance exactly one interval — the guard should prevent the call
    vi.advanceTimersByTime(60_000);
    await flushPromises();

    expect(mockUpsert.mock.calls.length).toBe(callsAfterInit);

    setVisible();
    cleanup();
  });

  it('sends a heartbeat when document transitions from hidden to visible', async () => {
    const cleanup = startDesktopHeartbeat('user-vis-change');
    await flushPromises();

    const callsAfterInit = mockUpsert.mock.calls.length;

    // Trigger a visibility-change event to visible
    triggerVisibilityChange('visible');
    await flushPromises();

    expect(mockUpsert.mock.calls.length).toBeGreaterThan(callsAfterInit);

    cleanup();
  });

  it('cleanup removes the visibilitychange listener — no heartbeat fires after cleanup', async () => {
    // Use a spy on addEventListener/removeEventListener to verify the listener
    // is actually detached by the cleanup function.
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const cleanup = startDesktopHeartbeat('user-noleak');
    await flushPromises();

    // The handler registered via addEventListener should appear in addSpy
    const addCall = addSpy.mock.calls.find(([type]) => type === 'visibilitychange');
    expect(addCall).toBeDefined();
    const registeredHandler = addCall?.[1];

    cleanup();

    // removeEventListener must have been called with the same handler reference
    const removeCall = removeSpy.mock.calls.find(
      ([type, handler]) => type === 'visibilitychange' && handler === registeredHandler,
    );
    expect(removeCall).toBeDefined();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test suite 3 — error resilience
// ---------------------------------------------------------------------------

describe('heartbeat — error resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisible();
    mockUpsert.mockResolvedValue({ error: null });
    mockFromFn.mockReturnValue({ upsert: mockUpsert });
    mockGetSession.mockResolvedValue(VALID_SESSION);
  });

  afterEach(() => {
    setVisible();
  });

  it('swallows errors from getSession without propagating to the caller', async () => {
    mockGetSession.mockRejectedValue(new Error('Network failure'));

    const cleanup = startDesktopHeartbeat('user-sess-err');
    await expect(flushPromises()).resolves.toBeUndefined();

    cleanup();
  });

  it('swallows errors from upsert without propagating to the caller', async () => {
    mockUpsert.mockRejectedValue(new Error('DB write error'));

    const cleanup = startDesktopHeartbeat('user-db-err');
    await expect(flushPromises()).resolves.toBeUndefined();

    cleanup();
  });
});
