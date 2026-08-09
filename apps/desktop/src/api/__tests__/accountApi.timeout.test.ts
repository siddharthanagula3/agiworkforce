import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: tauri.invoke,
  isTauri: true,
}));

import { accountApi } from '../accountApi';
import { PROFILE_FETCH_TIMEOUT_MS } from '../../constants/timeouts';

/**
 * Reachable path under test:
 *   App.tsx:2078 `initializeAuthOrchestrator()`
 *     -> stores/authOrchestrator.ts `processAuthStateChange`
 *     -> `fetchCreditsWithCache`
 *     -> `accountApi.fetchUserProfile` (the only caller in the app)
 *
 * That await sits between STEP 3 and STEP 4 of the auth-change handler, so the
 * deadline below is how long the unified auth store — plan tier, credits,
 * billing surfaces — stays stale when `fetch_user_profile` hangs.
 *
 * `accountApi.ts` used to declare its own private `DEFAULT_TIMEOUT_MS = 30_000`
 * while `constants/timeouts.ts` declared `PROFILE_FETCH_TIMEOUT_MS = 15_000`
 * for exactly this operation and nothing imported it. These assertions are
 * written against the canonical export rather than a number, so re-introducing
 * a private copy that drifts from the policy fails here.
 */

/** A promise that never settles, standing in for a hung Rust command. */
function hang(): Promise<never> {
  return new Promise<never>(() => {});
}

describe('accountApi profile fetch deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tauri.invoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not give up before the canonical profile-fetch deadline', async () => {
    tauri.invoke.mockImplementation(hang);

    const settled = vi.fn();
    void accountApi.fetchUserProfile('token').catch(settled);

    await vi.advanceTimersByTimeAsync(PROFILE_FETCH_TIMEOUT_MS - 1);

    expect(settled).not.toHaveBeenCalled();
  });

  it('rejects at the canonical profile-fetch deadline, not a private copy', async () => {
    tauri.invoke.mockImplementation(hang);

    const settled = vi.fn();
    const call = accountApi.fetchUserProfile('token').catch(settled);

    await vi.advanceTimersByTimeAsync(PROFILE_FETCH_TIMEOUT_MS);
    await call;

    expect(settled).toHaveBeenCalledTimes(1);
    const error = settled.mock.calls[0]?.[0] as Error;
    expect(error.name).toBe('ApiTimeoutError');
    expect(error.message).toContain(`timed out after ${PROFILE_FETCH_TIMEOUT_MS}ms`);
  });

  it('releases the deadline timer once the command answers', async () => {
    tauri.invoke.mockResolvedValue({ id: 'user-1', email: 'user@example.com', credits: null });

    const before = vi.getTimerCount();
    await accountApi.fetchUserProfile('token');

    expect(vi.getTimerCount()).toBe(before);
  });
});
