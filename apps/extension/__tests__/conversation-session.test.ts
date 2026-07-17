/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignConversationOwner,
  claimConversationOwner,
  replaceConversationOwner,
  resolveBrowserConversationScope,
} from '../src/features/background/conversation-session';

const sessionStore: Record<string, unknown> = {};

const chromeMock = {
  windows: {
    getCurrent: vi.fn(async () => ({ id: 42 })),
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

    expect(first.conversationId).not.toBe(second.conversationId);
    expect(first.seedConversationId).toBe('conv-seed');
    expect(second.seedConversationId).toBe('conv-seed');
  });

  it('resumes the same owner when a side panel reopens in the same window', async () => {
    const first = await claimConversationOwner('window:1', 'conv-seed');
    const reopened = await claimConversationOwner('window:1', 'conv-newer-seed');

    expect(reopened).toEqual({ conversationId: first.conversationId });
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
});
