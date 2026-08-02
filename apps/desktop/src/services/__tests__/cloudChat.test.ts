import { beforeEach, describe, expect, it, vi } from 'vitest';

const createConversation = vi.fn();
const listConversations = vi.fn();
const getConversation = vi.fn();
const updateConversation = vi.fn();
const deleteConversation = vi.fn();
const saveMessage = vi.fn();
const deleteMessage = vi.fn();

vi.mock('../../lib/cloudChatPersistence', () => ({
  getDesktopCloudChatPersistenceClient: () => ({
    createConversation,
    listConversations,
    getConversation,
    updateConversation,
    deleteConversation,
    saveMessage,
    deleteMessage,
  }),
}));

vi.mock('../../stores/appModeStore', () => ({
  useAppModeStore: { getState: () => ({ mode: 'cloud' }) },
  selectPrivacyMode: () => 'managed',
}));

vi.mock('../../stores/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/auth')>();
  const state = {
    isAuthenticated: true,
    accessToken: 'desktop-cloud-token',
    user: { id: 'user-desktop', email: '' },
  };
  return {
    selectHasCloudAccountSession: actual.selectHasCloudAccountSession,
    useAuthStore: { getState: () => state },
  };
});

import {
  ensureCloudConversation,
  getCloudConversations,
  getCloudMessages,
  resetCloudConversationCoordinator,
} from '../cloudChat';

function conversation(id: string) {
  return {
    id,
    title: 'Cloud chat',
    model: null,
    projectId: null,
    pinned: false,
    starred: false,
    archived: false,
    isTemporary: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('cloudChat service', () => {
  beforeEach(() => {
    resetCloudConversationCoordinator();
    vi.clearAllMocks();
  });

  it('rejects a non-advancing conversation cursor without requesting another page', async () => {
    listConversations.mockResolvedValue({
      conversations: [conversation('conv_stuck')],
      hasMore: true,
      nextOffset: 0,
    });

    await expect(getCloudConversations()).rejects.toMatchObject({
      code: 'managed_cloud_pagination_non_advancing',
      resource: 'conversations',
      message: expect.stringContaining('Archive older conversations in AGI Web'),
    });
    expect(listConversations).toHaveBeenCalledOnce();
  });

  it('rejects a transcript whose reported total exceeds the Desktop item cap', async () => {
    getConversation.mockResolvedValue({
      conversation: conversation('conv_large'),
      messages: [],
      total: 1_001,
      hasMore: false,
    });

    await expect(getCloudMessages('conv_large')).rejects.toMatchObject({
      code: 'managed_cloud_pagination_item_limit',
      resource: 'messages',
      limit: 1_000,
      message: expect.stringContaining('Start a new chat'),
    });
  });

  it('aborts a half-open create when its only caller stops', async () => {
    let transportSignal: AbortSignal | undefined;
    createConversation.mockImplementation(
      (_input: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          transportSignal = options?.signal;
          options?.signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('stopped');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const caller = new AbortController();

    const pending = ensureCloudConversation(
      'conv_cancel_create',
      'New chat',
      'auto',
      undefined,
      caller.signal,
    );
    await vi.waitFor(() => expect(transportSignal).toBeDefined());
    caller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal?.aborted).toBe(true);
    expect(createConversation).toHaveBeenCalledOnce();
  });

  it('keeps a shared create alive while another caller is still waiting', async () => {
    let transportSignal: AbortSignal | undefined;
    let resolveCreate!: (value: ReturnType<typeof conversation>) => void;
    createConversation.mockImplementation(
      (_input: unknown, options?: { signal?: AbortSignal }) =>
        new Promise<ReturnType<typeof conversation>>((resolve) => {
          transportSignal = options?.signal;
          resolveCreate = resolve;
        }),
    );
    const stoppedCaller = new AbortController();
    const activeCaller = new AbortController();

    const stopped = ensureCloudConversation(
      'conv_shared_create',
      'New chat',
      'auto',
      undefined,
      stoppedCaller.signal,
    );
    const active = ensureCloudConversation(
      'conv_shared_create',
      'New chat',
      'auto',
      undefined,
      activeCaller.signal,
    );
    stoppedCaller.abort();

    await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });
    expect(transportSignal?.aborted).toBe(false);
    resolveCreate(conversation('conv_shared_create'));
    await expect(active).resolves.toMatchObject({ id: 'conv_shared_create' });
    expect(createConversation).toHaveBeenCalledOnce();
  });

  it('starts a replacement create before an aborted stale transport settles', async () => {
    let rejectFirstCreate!: (error: Error) => void;
    let resolveReplacement!: (value: ReturnType<typeof conversation>) => void;
    createConversation
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirstCreate = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof conversation>>((resolve) => {
            resolveReplacement = resolve;
          }),
      );
    const stoppedCaller = new AbortController();

    const stopped = ensureCloudConversation(
      'conv_replacement',
      'New chat',
      'auto',
      undefined,
      stoppedCaller.signal,
    );
    stoppedCaller.abort();
    await expect(stopped).rejects.toMatchObject({ name: 'AbortError' });

    const replacement = ensureCloudConversation('conv_replacement', 'New chat', 'auto');
    await vi.waitFor(() => expect(createConversation).toHaveBeenCalledTimes(2));

    // Settle the superseded transport while the replacement is still pending.
    // Its identity-guarded cleanup must not delete the newer coordinator entry.
    rejectFirstCreate(new Error('old transport observed abort'));
    await Promise.resolve();
    const replacementFollower = ensureCloudConversation('conv_replacement', 'New chat', 'auto');
    resolveReplacement(conversation('conv_replacement'));

    await expect(replacement).resolves.toMatchObject({ id: 'conv_replacement' });
    await expect(replacementFollower).resolves.toMatchObject({ id: 'conv_replacement' });
    expect(createConversation).toHaveBeenCalledTimes(2);
  });
});
