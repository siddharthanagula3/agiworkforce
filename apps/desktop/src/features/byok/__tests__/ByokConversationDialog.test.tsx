import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: vi.fn(),
  isTauriContext: vi.fn(() => false),
}));

vi.mock('../../../api/byok', () => ({
  createByokFork: vi.fn(),
  deleteApiKey: vi.fn(),
  listSavedApiKeys: vi.fn(),
}));

vi.mock('@agiworkforce/utils', async (importOriginal) => {
  const actual = await importOriginal<UtilsModule>();
  return {
    ...actual,
    buildLocalToByokHandoffDraft: vi.fn(
      async (params: { selectedContext: Array<{ id: string; content: string }> }) => ({
        draft: {
          id: 'handoff-fixture',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          selectedContext: [],
        },
        redactedPayload: '{}',
        redactedContext: params.selectedContext.map((item) => ({
          id: item.id,
          kind: 'message',
          label: item.id,
          redactedContent: item.content.replace('sk-local-secret', '[REDACTED]'),
        })),
        redactionReport: { findings: [], blocked: false },
      }),
    ),
  };
});

import { createByokFork } from '../../../api/byok';
import { useAppModeStore } from '../../../stores/appModeStore';
import { clearIdMappings, useChatStore } from '../../../stores/chat/chatStore';
import { ByokConversationDialog } from '../ByokConversationDialog';
import { useByokRequestStore } from '../byokRequestStore';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type UtilsModule = typeof import('@agiworkforce/utils');

describe('ByokConversationDialog', () => {
  beforeEach(() => {
    clearIdMappings();
    useAppModeStore.setState({ mode: 'local' });
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      messagesByConversation: {},
      messages: [],
    });
    vi.mocked(createByokFork).mockResolvedValue(9);
  });

  afterEach(() => {
    cleanup();
    act(() => useByokRequestStore.getState().close());
    vi.clearAllMocks();
  });

  it('starts an empty BYOK chat only after the user chooses it', () => {
    const localId = useChatStore.getState().createConversation('Empty local chat');
    render(<ByokConversationDialog />);
    expect(screen.queryByText('Start a BYOK chat?')).toBeNull();

    act(() => useByokRequestStore.getState().request(localId));
    fireEvent.click(screen.getByRole('button', { name: 'Start BYOK chat' }));

    const state = useChatStore.getState();
    const active = state.conversations.find((c) => c.id === state.activeConversationId);
    expect(active?.executionMode).toBe('byok');
    expect(state.conversations.find((c) => c.id === localId)?.executionMode).toBe('local_only');
    expect(useByokRequestStore.getState().pending).toBeNull();
    expect(createByokFork).not.toHaveBeenCalled();
  });

  it('forks a Local chat with messages through the consent dialog and saves the fork', async () => {
    const { createConversation, addMessage } = useChatStore.getState();
    const localId = createConversation('Local thread');
    addMessage({ role: 'user', content: 'My key is sk-local-secret' });
    addMessage({ role: 'assistant', content: 'Local answer' });
    render(<ByokConversationDialog />);

    act(() => useByokRequestStore.getState().request(localId));
    const confirm = await screen.findByRole('button', { name: 'Create BYOK chat' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(createByokFork).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'My key is [REDACTED]' },
            { role: 'assistant', content: 'Local answer' },
          ],
        }),
      ),
    );
    await waitFor(() => expect(useByokRequestStore.getState().pending).toBeNull());
    const state = useChatStore.getState();
    expect(state.activeConversationId).not.toBe(localId);
    expect(state.conversations.find((c) => c.id === localId)?.executionMode).toBe('local_only');
    expect(state.messagesByConversation[localId]?.[0]?.content).toBe('My key is sk-local-secret');
  });
});
