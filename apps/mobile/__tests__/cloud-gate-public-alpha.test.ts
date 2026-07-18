/**
 * PA-2 regression — Managed Cloud is PUBLIC ALPHA (open by default).
 *
 * Locks two invariants the public-alpha cutover must never regress:
 *   (a) The Mobile cloud-gate copy is the public-alpha SIGN-IN message — not
 *       "invite-only / join the waitlist / private beta". Signing in is the
 *       entitlement; there is no invite or waitlist gate.
 *   (b) Local Mode stays FAIL-CLOSED: when Cloud chat is disabled (kill-switch /
 *       local-only build) the gate blocks remote chat and assertRemoteChatAllowed
 *       throws — Local never auto-routes off the device.
 *
 * Also proves the entitlement wiring: `setCloudAccess(true)` (driven by the Clerk
 * sign-in bridge) flips `cloudUnlocked`, and signing out re-locks it.
 */

// MMKV shim so the persisted waitlist store can hydrate in the test runtime.
jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function') {
      store.persist.rehydrate();
    }
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import {
  MOBILE_REMOTE_CHAT_DISABLED_MESSAGE,
  MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE,
  RemoteChatDisabledError,
  assertRemoteChatAllowed,
  getRemoteChatDisabledReason,
} from '../services/remoteChatGate';
import { FEATURES } from '../lib/v1FeatureFlags';
import { CLOUD_LOCK_REASON } from '../src/features/model-picker/service';
import { useWaitlistStore } from '../src/features/waitlist/store';

const INVITE_WAITLIST_FRAMING = /invite|waitlist|private[ -]?beta/i;

describe('PA-2 cloud gate — public-alpha copy', () => {
  it('the sign-in message is the public-alpha CTA, not invite/waitlist framing', () => {
    expect(MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE).toBe(
      'Sign in to use AGI Cloud chat. Local Mode stays available on this device.',
    );
    expect(MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE).not.toMatch(INVITE_WAITLIST_FRAMING);
  });

  it('the disabled-build message never frames access as invite/waitlist gated', () => {
    expect(MOBILE_REMOTE_CHAT_DISABLED_MESSAGE).not.toMatch(INVITE_WAITLIST_FRAMING);
  });

  it('the locked cloud-model reason is a sign-in CTA, not invite-only', () => {
    expect(CLOUD_LOCK_REASON).toBe('Sign in to use AGI Cloud chat.');
    expect(CLOUD_LOCK_REASON).not.toMatch(INVITE_WAITLIST_FRAMING);
  });

  it('ships open by default: cloudChat on, no local-only invite gate', () => {
    expect(FEATURES.cloudChat).toBe(true);
    expect(FEATURES.schedules).toBe(true);
    expect(FEATURES.v1LocalOnly).toBe(false);
    // BYOK is not a Mobile v1 path — Mobile is Local + Cloud only.
    expect(FEATURES.byokKeys).toBe(false);
  });
});

describe('PA-2 cloud gate — entitlement, not invite', () => {
  it('allows a signed-in user (open by default — invite flag is a no-op)', () => {
    // Real flags: cloudChat on, not local-only. A signed-in user reaches cloud
    // chat with NO invite (cloudUnlocked irrelevant once v1LocalOnly is false).
    expect(getRemoteChatDisabledReason(FEATURES, { cloudUnlocked: false })).toBeNull();
    expect(getRemoteChatDisabledReason(FEATURES, { cloudUnlocked: true })).toBeNull();
    expect(() => assertRemoteChatAllowed(FEATURES, { cloudUnlocked: true })).not.toThrow();
  });
});

describe('PA-2 cloud gate — Local stays fail-closed', () => {
  it('blocks remote chat when Cloud chat is disabled (kill-switch / local-only build)', () => {
    const disabledBuild = { v1LocalOnly: true, cloudChat: false, byokKeys: false };
    expect(getRemoteChatDisabledReason(disabledBuild, { cloudUnlocked: true })).toBe(
      MOBILE_REMOTE_CHAT_DISABLED_MESSAGE,
    );
    expect(() => assertRemoteChatAllowed(disabledBuild, { cloudUnlocked: true })).toThrow(
      RemoteChatDisabledError,
    );
  });

  it('requires sign-in in an explicit local-only build before remote chat', () => {
    const localOnly = { v1LocalOnly: true, cloudChat: true, byokKeys: false };
    expect(getRemoteChatDisabledReason(localOnly, { cloudUnlocked: false })).toBe(
      MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE,
    );
  });
});

describe('PA-2 entitlement wiring — sign-in unlocks cloud access', () => {
  beforeEach(() => {
    useWaitlistStore.getState().clear();
  });

  it('setCloudAccess(true) unlocks cloud; signing out re-locks it', () => {
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(false);

    // ClerkTokenBridge calls this when a Clerk session becomes active.
    useWaitlistStore.getState().setCloudAccess(true);
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(true);
    expect(useWaitlistStore.getState().cloudUnlockedAt).toBeTruthy();

    // Signing out closes the unlock — no stale cloud access persists.
    useWaitlistStore.getState().setCloudAccess(false);
    expect(useWaitlistStore.getState().cloudUnlocked).toBe(false);
    expect(useWaitlistStore.getState().cloudUnlockedAt).toBeUndefined();
  });
});
