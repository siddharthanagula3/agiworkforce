import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  linkConversationId: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: host.invoke,
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    host.listeners.set(event, handler);
    return () => host.listeners.delete(event);
  }),
  isTauri: true,
  isTauriContext: () => true,
}));

vi.mock('../../../stores/appModeStore', async (importOriginal) => ({
  ...(await importOriginal<AppmodestoreModule>()),
  useAppModeStore: Object.assign(
    (selector: (state: { mode: string }) => unknown) => selector({ mode: 'local' }),
    { getState: () => ({ mode: 'local' }) },
  ),
  selectPrivacyMode: (state: { mode: string }) => (state.mode === 'local' ? 'local' : 'managed'),
}));

vi.mock('../../../stores/chat/chatStore', () => ({
  uuidToDbId: () => undefined,
  dbIdToUuid: (dbId: number) => `frontend-${dbId}`,
  resolveDesktopChatOwnerId: () => 'user-123',
  useChatStore: {
    getState: () => ({ linkConversationId: host.linkConversationId, conversations: [] }),
  },
}));

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector({ windowPreferences: { theme: 'dark' } }),
    {
      getState: () => ({
        personalization: {
          name: '',
          occupation: '',
          bio: '',
          formality: 3,
          warmth: 3,
          detail: 3,
          emojiUsage: 'sometimes',
        },
      }),
    },
  ),
}));

vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: { getState: () => ({ currentFolder: null }) },
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => ({
  ...(await importOriginal<UnifiedChatModule>()),
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { useChatModelStore } from '@agiworkforce/unified-chat';
import { FloatingChat } from '../index';

type TauriMockModule = typeof import('../../../lib/tauri-mock');
type AppmodestoreModule = typeof import('../../../stores/appModeStore');
type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

describe('FloatingChat request boundary', () => {
  beforeEach(() => {
    host.listeners.clear();
    Element.prototype.scrollIntoView = vi.fn();
    useChatModelStore.setState({ selectedModelId: 'fixture-local-selected' });
    host.invoke.mockImplementation(async (command: string) => {
      if (command === 'llm_get_available_models') {
        return [
          {
            id: 'fixture-local-selected',
            name: 'Selected local model',
            provider: 'ollama',
            available: true,
          },
        ];
      }
      if (command === 'chat_create_conversation') {
        return {
          id: 42,
          title: 'Hello',
          created_at: '2026-10-11T00:00:00.000Z',
          updated_at: '2026-10-11T00:00:00.000Z',
        };
      }
      if (command === 'chat_send_message') {
        setTimeout(() => {
          host.listeners.get('chat:stream-chunk')?.({
            payload: { conversation_id: 42, delta: 'Hello back' },
          });
          host.listeners.get('chat:stream-end')?.({
            payload: { conversation_id: 42, message_id: null },
          });
        }, 0);
      }
      return undefined;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
  });

  it('sends on the Local boundary with the main chat’s owner and model, and renders the reply', async () => {
    render(<FloatingChat />);
    const composer = await screen.findByLabelText('Message');
    await waitFor(() => expect((composer as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(composer, { target: { value: 'Hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    });

    expect(await screen.findByText('Hello back')).toBeTruthy();

    expect(host.invoke).toHaveBeenCalledWith('chat_create_conversation', {
      request: expect.objectContaining({ userId: 'user-123', executionMode: 'local_only' }),
    });
    const send = host.invoke.mock.calls.find(([command]) => command === 'chat_send_message');
    expect(send?.[1]).toEqual({
      request: expect.objectContaining({
        content: 'Hello',
        userId: 'user-123',
        conversationId: 42,
        activeMode: 'local',
        executionMode: 'local_only',
        preferCloudCredits: false,
        provider: 'ollama',
        modelOverride: 'fixture-local-selected',
        enableTools: false,
        toolScope: undefined,
        stream: true,
      }),
    });
  });
});
