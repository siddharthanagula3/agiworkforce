import { describe, expect, it, vi } from 'vitest';
import {
  cloudMessageSyncFingerprint,
  type ConversationEntry,
  type HistoryMessage,
} from '../src/features/background/conversation-history';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  createHistoryShareLink,
  historyShareAvailability,
  type HistoryShareDependencies,
} from '../src/features/side-panel/historyShare';
import { ChromeShareError, createChromeShareLink } from '../src/features/cloud-bridge/shareClient';

const owner: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };
const successor: ManagedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
const link = { url: 'https://share.example/abc', expiresAt: null };
const cloudConversationId = '11111111-1111-4111-8111-111111111111';
const savedSync = {
  state: 'idle',
  conversationId: cloudConversationId,
  createAcknowledged: true,
  messagesLoaded: true,
} as const;

function stored(overrides: Partial<ConversationEntry> = {}): ConversationEntry {
  return {
    id: 'local-1',
    owner,
    title: 'Plan',
    messages: [
      { role: 'user', content: 'ask', timestamp: 1 },
      { role: 'assistant', content: '   ', timestamp: 2 },
      { role: 'assistant', content: 'answer', timestamp: 3 },
    ],
    savedAt: 3,
    routing: { selectedModel: 'auto' },
    cloudSync: { ...savedSync },
    ...overrides,
  };
}

function harness(overrides: Partial<HistoryShareDependencies> = {}) {
  const createLink = vi.fn(async () => link);
  const dependencies: HistoryShareDependencies = {
    owner,
    entryId: 'local-1',
    isLive: () => true,
    getAuth: async () => ({ token: 'token-a', owner }),
    getStored: async () => stored(),
    createLink,
    ...overrides,
  };
  return { dependencies, createLink };
}

describe('history share publication', () => {
  it('publishes the stored transcript with the confirming account credential', async () => {
    const { dependencies, createLink } = harness();
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({
      status: 'created',
      link,
    });
    expect(createLink).toHaveBeenCalledWith('token-a', {
      title: 'Plan',
      messages: [
        { role: 'user', content: 'ask', timestamp: 1 },
        { role: 'assistant', content: 'answer', timestamp: 3 },
      ],
      conversationId: cloudConversationId,
    });
  });

  it('passes the cloud conversation identity of the stored record', async () => {
    const { dependencies, createLink } = harness();
    await createHistoryShareLink(dependencies);
    expect(createLink).toHaveBeenCalledWith(
      'token-a',
      expect.objectContaining({ conversationId: cloudConversationId }),
    );
  });

  it('never publishes a local snapshot under a successor account credential', async () => {
    const { dependencies, createLink } = harness({
      getAuth: async () => ({ token: 'token-b', owner: successor }),
    });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'retired' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('does not publish after the confirmation was dismissed during authentication', async () => {
    let live = true;
    const { dependencies, createLink } = harness({
      getAuth: async () => {
        live = false;
        return { token: 'token-a', owner };
      },
      isLive: () => live,
    });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'retired' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('does not publish after the account changed while the transcript was read', async () => {
    let live = true;
    const { dependencies, createLink } = harness({
      getStored: async () => {
        live = false;
        return stored();
      },
      isLive: () => live,
    });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'retired' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('reports a retired confirmation when it ends after the link was created', async () => {
    let live = true;
    const { dependencies } = harness({
      createLink: async () => {
        live = false;
        return link;
      },
      isLive: () => live,
    });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'retired' });
  });

  it('refuses a record whose messages were never loaded on this device', async () => {
    const { dependencies, createLink } = harness({
      getStored: async () =>
        stored({
          messages: [],
          cloudSync: { state: 'idle', conversationId: cloudConversationId, messagesLoaded: false },
        }),
    });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'not-loaded' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('refuses a record that no longer exists', async () => {
    const { dependencies, createLink } = harness({ getStored: async () => undefined });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'not-loaded' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('asks the user to sign in when no credential is available', async () => {
    const { dependencies, createLink } = harness({ getAuth: async () => null });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'signed-out' });
    expect(createLink).not.toHaveBeenCalled();
  });
});

describe('sharing a chat that is not saved to the account', () => {
  it.each([
    ['has never been saved to the account', { cloudSync: undefined }],
    [
      'is still being created in the account',
      { cloudSync: { ...savedSync, createAcknowledged: false, state: 'pending' as const } },
    ],
    [
      'was removed from the account',
      {
        cloudSync: { ...savedSync, state: 'blocked' as const, blockedReason: 'not-found' as const },
      },
    ],
    [
      'holds a Local turn that never leaves this browser',
      {
        messages: [
          { role: 'user' as const, content: 'ask', timestamp: 1, runtime: 'local' as const },
        ],
      },
    ],
  ])('offers no share for a chat that %s, and never asks the server', async (_label, overrides) => {
    const entry = stored(overrides);
    expect(historyShareAvailability(entry)).toBe('local-only');

    const { dependencies, createLink } = harness({ getStored: async () => entry });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({ status: 'local-only' });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('offers share for a chat saved to the account', () => {
    expect(historyShareAvailability(stored())).toBe('available');
  });

  it('reports the server refusing an unsaved chat in its own words', async () => {
    const message =
      'Only a chat saved to your account can be shared. Turn on sync for this chat, then share it again.';
    const { dependencies } = harness({
      createLink: async () => {
        throw new ChromeShareError(message, 'not-saved');
      },
    });
    await expect(createHistoryShareLink(dependencies)).resolves.toEqual({
      status: 'local-only',
      message,
    });
  });

  function savedMessage(message: HistoryMessage): HistoryMessage {
    return {
      ...message,
      cloudSyncedAt: 4,
      cloudSyncedChars: message.content.length,
      cloudSyncedFingerprint: cloudMessageSyncFingerprint(message),
    };
  }

  it.each([
    ['changes this browser has not saved yet', true, false],
    ['an account copy that changed elsewhere', false, true],
  ])(
    'turns a stored-copy mismatch into a way forward for %s',
    async (_label, unsavedChanges, allSaved) => {
      const message =
        'This chat has changes that are not saved to your account yet. Wait for them to save, then share again.';
      const { dependencies } = harness({
        getStored: async () => {
          const entry = stored();
          return allSaved ? { ...entry, messages: entry.messages.map(savedMessage) } : entry;
        },
        createLink: async () => {
          throw new ChromeShareError(message, 'out-of-sync');
        },
      });
      await expect(createHistoryShareLink(dependencies)).resolves.toEqual({
        status: 'out-of-sync',
        message,
        unsavedChanges,
      });
    },
  );
});

describe('the share link client', () => {
  function serverAnswers(status: number, body: unknown, headers: Record<string, string> = {}) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(body, { status, headers })),
    );
  }

  async function shareFailure(): Promise<ChromeShareError> {
    const failure = await createChromeShareLink('token-a', {
      title: 'Plan',
      messages: [{ role: 'user', content: 'ask' }],
      conversationId: cloudConversationId,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    vi.unstubAllGlobals();
    expect(failure).toBeInstanceOf(ChromeShareError);
    return failure as ChromeShareError;
  }

  it('tells an unsaved chat from a chat whose account copy differs', async () => {
    const unsaved =
      'Only a chat saved to your account can be shared. Turn on sync for this chat, then share it again.';
    serverAnswers(400, { error: { code: 'VALIDATION_ERROR', message: unsaved } });
    await expect(shareFailure()).resolves.toMatchObject({ kind: 'not-saved', message: unsaved });

    const differs =
      'This chat has changes that are not saved to your account yet. Wait for them to save, then share again.';
    serverAnswers(409, { error: { code: 'CONFLICT', message: differs } });
    await expect(shareFailure()).resolves.toMatchObject({ kind: 'out-of-sync', message: differs });
  });

  it('says what the daily share limit is when it is reached', async () => {
    serverAnswers(
      429,
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please wait before trying again.',
          reason: 'rate_limit:share-create-account-day',
          retry_after_seconds: 600,
        },
        rateLimit: { limit: 50, remaining: 0, retry_after_seconds: 600 },
      },
      { 'Retry-After': '600' },
    );
    const failure = await shareFailure();
    expect(failure.kind).toBe('limited');
    expect(failure.message).toBe(
      'Too many requests. Please wait before trying again. The limit is 50 share links. Try again in 10 minutes.',
    );
  });

  it('reads a workspace policy and a slow server as what they are', async () => {
    const policy = 'Your workspace administrator has turned off external sharing.';
    serverAnswers(403, {
      error: { type: 'organization_policy', code: 'feature_disabled', message: policy },
    });
    await expect(shareFailure()).resolves.toMatchObject({ kind: 'refused', message: policy });

    serverAnswers(
      503,
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
      { 'retry-after': '5' },
    );
    await expect(shareFailure()).resolves.toMatchObject({
      kind: 'unavailable',
      message: 'Sharing is temporarily unavailable. Try again in 5 seconds.',
    });
  });
});
