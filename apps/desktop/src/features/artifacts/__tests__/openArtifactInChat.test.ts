import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getArtifact: vi.fn(),
  selectConversation: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));
vi.mock('@/runtime/TauriRuntime', () => ({
  resolveArtifactRenderType: (_render: unknown, native: unknown) =>
    native === 'web' ? 'html' : native,
}));
vi.mock('@/stores/artifactStore', () => ({
  useArtifactStore: { getState: () => ({ getArtifact: mocks.getArtifact }) },
}));
vi.mock('@/stores/chat/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      conversations: [{ id: 'chat-7' }],
      selectConversation: mocks.selectConversation,
    }),
  },
  uuidToDbId: (id: string) => (id === 'chat-7' ? 7 : undefined),
}));

import { useChatArtifactStore, useChatUIStore } from '@agiworkforce/unified-chat';
import type { Artifact } from '@/api/artifacts';
import { nativeArtifactToChat, openArtifactInChat } from '../openArtifactInChat';

const native: Artifact = {
  id: 'art-1',
  title: 'Landing page',
  artifact_type: 'web',
  content: '<h1>Hi</h1>',
  metadata: { Code: { language: 'html', executable: false } },
  conversation_id: 7,
  message_id: 12,
  status: 'complete',
  versions: [],
  current_version: 3,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
  tags: [],
  pinned: false,
};

describe('openArtifactInChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatArtifactStore.getState().closeArtifact();
    useChatUIStore.getState().closeArtifactPanel();
  });

  it('maps a stored artifact to the chat panel shape', () => {
    expect(nativeArtifactToChat(native)).toMatchObject({
      id: 'art-1',
      type: 'html',
      title: 'Landing page',
      language: 'html',
      version: 3,
      conversationId: '7',
      messageId: '12',
    });
  });

  it('opens the artifact in the chat panel inside the chat that made it', async () => {
    mocks.getArtifact.mockResolvedValue(native);
    const navigate = vi.fn();
    window.addEventListener('desktop:navigate-panel', navigate);

    await expect(openArtifactInChat('art-1')).resolves.toBe(true);

    window.removeEventListener('desktop:navigate-panel', navigate);
    expect(mocks.selectConversation).toHaveBeenCalledWith('chat-7');
    expect(navigate).toHaveBeenCalled();
    expect(useChatArtifactStore.getState().activeArtifact?.id).toBe('art-1');
    expect(useChatUIStore.getState().activeRightPanel).toBe('artifact');
  });

  it('says so when the artifact is gone', async () => {
    mocks.getArtifact.mockResolvedValue(null);

    await expect(openArtifactInChat('missing')).resolves.toBe(false);
    expect(mocks.toastError).toHaveBeenCalled();
    expect(useChatArtifactStore.getState().activeArtifact).toBeNull();
  });
});
