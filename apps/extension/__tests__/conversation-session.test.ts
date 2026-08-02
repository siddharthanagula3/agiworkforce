/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignConversationOwner as assignOwnedConversationOwner,
  claimConversationOwner as claimOwnedConversationOwner,
  claimSelectedConversationOwner as claimSelectedOwnedConversationOwner,
  replaceConversationOwner as replaceOwnedConversationOwner,
  restoreConversationOwnerIfCurrent as restoreOwnedConversationOwnerIfCurrent,
  resolveBrowserConversationScope,
} from '../src/features/background/conversation-session';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };
const OTHER_OWNER: ManagedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
const assignConversationOwner = (scope: string, conversationId: string) =>
  assignOwnedConversationOwner(scope, OWNER, conversationId);
const claimConversationOwner = (scope: string, seedConversationId?: string) =>
  claimOwnedConversationOwner(scope, OWNER, seedConversationId);
const claimSelectedConversationOwner = (scope: string, selectedConversationId: string) =>
  claimSelectedOwnedConversationOwner(scope, OWNER, selectedConversationId);
const replaceConversationOwner = (scope: string) => replaceOwnedConversationOwner(scope, OWNER);
const restoreConversationOwnerIfCurrent = (
  scope: string,
  expectedConversationId: string,
  replacementConversationId: string,
) =>
  restoreOwnedConversationOwnerIfCurrent(
    scope,
    OWNER,
    expectedConversationId,
    replacementConversationId,
  );

const sessionStore: Record<string, unknown> = {};

const chromeMock = {
  windows: {
    getCurrent: vi.fn(async () => ({ id: 42 })),
    getAll: vi.fn(async () => [{ id: 1 }, { id: 2 }, { id: 42 }]),
  },
  storage: {
    session: {
      get: vi.fn(async (keys: string[]) =>
        Object.fromEntries(keys.map((key) => [key, sessionStore[key]])),
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
    },
  },
};

vi.stubGlobal('chrome', chromeMock);

describe('browser conversation session ownership', () => {
  beforeEach(() => {
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
    vi.clearAllMocks();
    chromeMock.windows.getCurrent.mockResolvedValue({ id: 42 });
    chromeMock.windows.getAll.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 42 }]);
  });

  it('uses the containing Chrome window as the stable side-panel scope', async () => {
    await expect(resolveBrowserConversationScope('panel-fallback')).resolves.toBe('window:42');
  });

  it('falls back to the panel instance when Chrome cannot identify a window', async () => {
    chromeMock.windows.getCurrent.mockRejectedValueOnce(new Error('no current window'));

    await expect(resolveBrowserConversationScope('panel-fallback')).resolves.toBe(
      'panel:panel-fallback',
    );
  });

  it('gives distinct windows distinct conversation owners while retaining the same seed', async () => {
    const first = await claimConversationOwner('window:1', 'conv-seed');
    const second = await claimConversationOwner('window:2', 'conv-seed');

    expect(first).toEqual({ conversationId: 'conv-seed' });
    expect(second.conversationId).not.toBe(first.conversationId);
    expect(second.seedConversationId).toBe('conv-seed');
  });

  it('samples live windows only after earlier owner mutations have completed', async () => {
    let releaseRead!: () => void;
    let markReadStarted!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    chromeMock.storage.session.get.mockImplementationOnce(async (keys: string[]) => {
      markReadStarted();
      await readGate;
      return Object.fromEntries(keys.map((key) => [key, sessionStore[key]]));
    });

    const firstOwner = assignConversationOwner('window:1', 'conv-atomic');
    await readStarted;
    const queuedClaim = claimSelectedConversationOwner('window:2', 'conv-atomic');
    await Promise.resolve();
    expect(chromeMock.windows.getAll).not.toHaveBeenCalled();

    releaseRead();
    await firstOwner;
    const claim = await queuedClaim;
    expect(chromeMock.windows.getAll).toHaveBeenCalledTimes(1);
    expect(claim.forked).toBe(true);
    expect(claim.conversationId).not.toBe('conv-atomic');
  });

  it('bounds owner normalization before reading attacker-sized session maps', async () => {
    let accessed = 0;
    const oversizedOwners: Record<string, unknown> = {};
    for (let index = 0; index < 500; index += 1) {
      Object.defineProperty(oversizedOwners, `window:${index + 100}`, {
        enumerable: true,
        get: () => {
          accessed += 1;
          return { conversationId: `conv-${index}`, touchedAt: index };
        },
      });
    }
    sessionStore['agi_browser_conversation_owners_v1'] = {
      version: 1,
      owners: oversizedOwners,
    };

    await claimConversationOwner('window:42');

    expect(accessed).toBeLessThanOrEqual(64);
    const persisted = sessionStore['agi_browser_conversation_owners_v1'] as {
      owners: Record<string, unknown>;
    };
    expect(Object.keys(persisted.owners).length).toBeLessThanOrEqual(32);
  });

  it('resumes the same owner when a side panel reopens in the same window', async () => {
    const first = await claimConversationOwner('window:1', 'conv-seed');
    const reopened = await claimConversationOwner('window:1', 'conv-newer-seed');

    expect(reopened).toEqual({ conversationId: first.conversationId });
  });

  it('replaces the same window state when the account or auth incarnation changes', async () => {
    const first = await claimOwnedConversationOwner('window:1', OWNER, 'conv-account-a');
    const second = await claimOwnedConversationOwner('window:1', OTHER_OWNER, 'conv-account-b');

    expect(first.conversationId).toBe('conv-account-a');
    expect(second.conversationId).toBe('conv-account-b');
    await expect(claimOwnedConversationOwner('window:1', OTHER_OWNER)).resolves.toEqual({
      conversationId: 'conv-account-b',
    });
  });

  it('atomically replaces a window owner for New Chat', async () => {
    const first = await claimConversationOwner('window:1');
    const replacement = await replaceConversationOwner('window:1');
    const reopened = await claimConversationOwner('window:1');

    expect(replacement).not.toBe(first.conversationId);
    expect(reopened.conversationId).toBe(replacement);
  });

  it('persists the caller-created owner used by an admitted turn', async () => {
    await assignConversationOwner('window:1', 'conv-owned-turn');

    await expect(claimConversationOwner('window:1')).resolves.toEqual({
      conversationId: 'conv-owned-turn',
    });
  });

  it('opens an unowned history record without allocating a duplicate', async () => {
    const first = await claimSelectedConversationOwner('window:1', 'conv-history');
    const reopened = await claimSelectedConversationOwner('window:1', 'conv-history');

    expect(first).toEqual({ conversationId: 'conv-history', forked: false });
    expect(reopened).toEqual({ conversationId: 'conv-history', forked: false });
  });

  it('forks only when another live window owns the selected history record', async () => {
    await claimSelectedConversationOwner('window:1', 'conv-shared');
    const secondWindow = await claimSelectedConversationOwner('window:2', 'conv-shared');

    expect(secondWindow.forked).toBe(true);
    expect(secondWindow.conversationId).not.toBe('conv-shared');
    await expect(claimConversationOwner('window:2')).resolves.toEqual({
      conversationId: secondWindow.conversationId,
    });
  });

  it('serializes simultaneous claims so exactly one live window adopts the selected id', async () => {
    const claims = await Promise.all([
      claimSelectedConversationOwner('window:1', 'conv-raced'),
      claimSelectedConversationOwner('window:2', 'conv-raced'),
    ]);

    expect(claims.filter((claim) => claim.conversationId === 'conv-raced')).toHaveLength(1);
    expect(claims.filter((claim) => claim.forked)).toHaveLength(1);
    expect(new Set(claims.map((claim) => claim.conversationId)).size).toBe(2);
  });

  it('reclaims a history record from a closed window instead of forking', async () => {
    await claimSelectedConversationOwner('window:1', 'conv-reclaim');
    chromeMock.windows.getAll.mockResolvedValue([{ id: 2 }]);

    await expect(claimSelectedConversationOwner('window:2', 'conv-reclaim')).resolves.toEqual({
      conversationId: 'conv-reclaim',
      forked: false,
    });
  });

  it('does not let a delayed history claim rollback overwrite a newer New Chat owner', async () => {
    await assignConversationOwner('window:1', 'conv-before');
    let releaseRead!: () => void;
    let markReadStarted!: () => void;
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const readStarted = new Promise<void>((resolve) => {
      markReadStarted = resolve;
    });
    chromeMock.storage.session.get.mockImplementationOnce(async (keys: string[]) => {
      markReadStarted();
      await readGate;
      return Object.fromEntries(keys.map((key) => [key, sessionStore[key]]));
    });

    const staleClaimPromise = claimSelectedConversationOwner('window:1', 'conv-history');
    await readStarted;
    const newChatPromise = replaceConversationOwner('window:1');
    releaseRead();
    const staleClaim = await staleClaimPromise;
    const newChatConversationId = await newChatPromise;

    await expect(
      restoreConversationOwnerIfCurrent('window:1', staleClaim.conversationId, 'conv-before'),
    ).resolves.toBe(false);
    await expect(claimConversationOwner('window:1')).resolves.toEqual({
      conversationId: newChatConversationId,
    });
  });

  it('rolls back a stale claim only while that exact claim still owns the scope', async () => {
    await assignConversationOwner('window:1', 'conv-before');
    const staleClaim = await claimSelectedConversationOwner('window:1', 'conv-history');

    await expect(
      restoreConversationOwnerIfCurrent('window:1', staleClaim.conversationId, 'conv-before'),
    ).resolves.toBe(true);
    await expect(claimConversationOwner('window:1')).resolves.toEqual({
      conversationId: 'conv-before',
    });
  });
});
