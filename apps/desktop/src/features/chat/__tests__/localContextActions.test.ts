import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: (...args: unknown[]) => invoke(...args),
}));

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (message: string) => toastSuccess(message) } }));

const loadConversationMessages = vi.fn(async () => undefined);
vi.mock('../../../stores/chat/chatStore', async (importOriginal) => ({
  ...(await importOriginal<ChatstoreModule>()),
  resolveDesktopChatOwnerId: () => 'user-1',
  uuidToDbId: (id: string) => (id === 'chat-1' ? 7 : undefined),
  useChatStore: { getState: () => ({ loadConversationMessages }) },
}));

const modelState = { selectedModel: 'auto' as string | null };
vi.mock('../../../stores/modelStore', async (importOriginal) => ({
  ...(await importOriginal<ModelstoreModule>()),
  useModelStore: { getState: () => modelState },
}));

import { compactLocalConversation, fetchLocalContextUsage } from '../localContextActions';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type ChatstoreModule = typeof import('../../../stores/chat/chatStore');
type ModelstoreModule = typeof import('../../../stores/modelStore');

describe('local context actions', () => {
  beforeEach(() => {
    invoke.mockReset();
    toastSuccess.mockReset();
    loadConversationMessages.mockClear();
    modelState.selectedModel = 'auto';
  });

  it('asks Rust for usage and lets the catalog resolve the window for Auto', async () => {
    invoke.mockResolvedValueOnce({ tokensUsed: 10, contextWindow: 100 });

    await expect(fetchLocalContextUsage('chat-1')).resolves.toEqual({
      tokensUsed: 10,
      contextWindow: 100,
    });
    expect(invoke).toHaveBeenCalledWith('chat_get_context_usage', {
      conversationId: 7,
      userId: 'user-1',
      model: undefined,
    });
    await expect(fetchLocalContextUsage('draft')).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('compacts with the focus, reloads the transcript and reports the result', async () => {
    invoke.mockResolvedValueOnce({ messages_compacted: 12, message: 'Compacted 12 messages.' });

    await compactLocalConversation('chat-1', 'code');

    expect(invoke).toHaveBeenCalledWith('chat_compact_context', {
      conversationId: 7,
      focus: 'code',
      userId: 'user-1',
    });
    expect(loadConversationMessages).toHaveBeenCalledWith('chat-1', 'user-1');
    expect(toastSuccess).toHaveBeenCalledWith('Compacted 12 messages.');
  });

  it('reloads the shown transcript after a compaction, and not when nothing was compacted', async () => {
    const reloadTranscript = vi.fn(async () => undefined);
    invoke.mockResolvedValueOnce({ messages_compacted: 3, message: 'Compacted 3 messages.' });
    await compactLocalConversation('chat-1', undefined, reloadTranscript);
    expect(reloadTranscript).toHaveBeenCalledWith('chat-1');

    reloadTranscript.mockClear();
    invoke.mockResolvedValueOnce({ messages_compacted: 0, message: 'Nothing to compact.' });
    await compactLocalConversation('chat-1', undefined, reloadTranscript);
    expect(reloadTranscript).not.toHaveBeenCalled();
  });

  it('refuses a chat that is not saved locally yet', async () => {
    await expect(compactLocalConversation('draft')).rejects.toThrow('before compacting');
    expect(invoke).not.toHaveBeenCalled();
  });
});
