/**
 * Cloud-unlock state helpers.
 *
 * v1: state is stored locally in chrome.storage.local only.
 * Cross-surface inheritance from the desktop app (bridge port 8787) is deferred
 * — the protocol would need a new message type which requires supervisor sign-off.
 * For now, each surface tracks its own unlock state. A future stage can add
 * `getCloudUnlockState` via the native-messaging bridge once the protocol is
 * agreed upon.
 */

const CLOUD_UNLOCKED_KEY = 'agi_cloud_unlocked';

export interface CloudUnlockState {
  unlocked: boolean;
  inviteId?: string;
  unlockedAt?: number;
}

export async function getCloudUnlockState(): Promise<CloudUnlockState> {
  try {
    const result = await chrome.storage.local.get([CLOUD_UNLOCKED_KEY]);
    const raw = result[CLOUD_UNLOCKED_KEY] as Partial<CloudUnlockState> | undefined;
    // SECURITY (audit batch-220 [MEDIUM] validation bypass, fixed 2026-06-13):
    // require a validated shape with a non-empty inviteId before honoring an
    // unlock, so a bare `{ unlocked: true }` written to chrome.storage.local
    // cannot flip cloud-unlock. (Server-side invite re-verification remains the
    // authoritative gate before any cloud routing is enabled.)
    if (
      raw &&
      raw.unlocked === true &&
      typeof raw.inviteId === 'string' &&
      raw.inviteId.length > 0
    ) {
      return {
        unlocked: true,
        inviteId: raw.inviteId,
        ...(typeof raw.unlockedAt === 'number' ? { unlockedAt: raw.unlockedAt } : {}),
      };
    }
  } catch {
    // chrome.storage unavailable — treat as locked
  }
  return { unlocked: false };
}

export async function setCloudUnlocked(inviteId: string): Promise<void> {
  try {
    const state: CloudUnlockState = {
      unlocked: true,
      inviteId,
      unlockedAt: Date.now(),
    };
    await chrome.storage.local.set({ [CLOUD_UNLOCKED_KEY]: state });
  } catch {
    // swallow — in-memory state in the modal will still reflect success
  }
}
