import { describe, expect, it, vi } from 'vitest';
import type { ConversationEntry } from '../src/features/background/conversation-history';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  createHistoryShareLink,
  type HistoryShareDependencies,
} from '../src/features/side-panel/historyShare';

const owner: ManagedCloudOwner = { accountId: 'account-a', authIncarnation: 'session-a' };
const successor: ManagedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
const link = { url: 'https://share.example/abc', expiresAt: null };
const cloudConversationId = '11111111-1111-4111-8111-111111111111';

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
    });
  });

  it('passes the cloud conversation identity of the stored record', async () => {
    const { dependencies, createLink } = harness({
      getStored: async () =>
        stored({
          cloudSync: { state: 'idle', conversationId: cloudConversationId, messagesLoaded: true },
        }),
    });
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
