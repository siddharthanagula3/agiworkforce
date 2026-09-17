import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_CONVERSATION_KEY,
  selectDraftContent,
  useChatStore,
} from '@shared/stores/web-chat-store';
import { stageLibraryItemForNewChat, takeStagedLibraryAttachments } from '../library-chat-handoff';

const ITEM = {
  id: 'asset-1',
  file_name: 'brief.pdf',
  mime_type: 'application/pdf',
  kind: 'file',
  byte_count: 4,
  uri: '/api/files/asset-1',
  surface: 'file' as const,
  previewable: false,
  origin: 'uploaded' as const,
  source_surface: 'web',
  provider: null,
  model: null,
  prompt: null,
  created_at: '2026-09-01T00:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
  takeStagedLibraryAttachments();
});

describe('library chat handoff', () => {
  it('stages the stored bytes once, with the draft and mode for the new chat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('%PDF')),
    );

    await stageLibraryItemForNewChat(ITEM, { workMode: 'agiwork', draft: 'Summarise this' });

    const state = useChatStore.getState();
    expect(state.getComposerToggles(PENDING_CONVERSATION_KEY).workMode).toBe('agiwork');
    expect(selectDraftContent(null)(state)).toBe('Summarise this');

    const staged = takeStagedLibraryAttachments();
    expect(staged).toHaveLength(1);
    expect(staged?.[0]).toBeInstanceOf(File);
    expect(staged?.[0]?.name).toBe('brief.pdf');
    expect(staged?.[0]?.size).toBe(4);
    expect(takeStagedLibraryAttachments()).toBeNull();
  });

  it('stages nothing when the stored file cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await expect(stageLibraryItemForNewChat(ITEM, { workMode: 'chat' })).rejects.toThrow();
    expect(takeStagedLibraryAttachments()).toBeNull();
  });
});
