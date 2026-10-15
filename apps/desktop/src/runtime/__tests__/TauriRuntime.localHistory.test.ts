import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
} from '@agiworkforce/cloud-contracts';
import { modelsCatalog } from '@agiworkforce/types';

type TauriMockModule = typeof import('../../lib/tauri-mock');
type ChatstoreModule = typeof import('../../stores/chat/chatStore');
type AuthModule = typeof import('../../stores/auth');
type AppmodestoreModule = typeof import('../../stores/appModeStore');
type SettingsstoreModule = typeof import('../../stores/settingsStore');

const invokeMock = vi.fn();
const toastError = vi.fn();
const listenHandlers = new Map<string, (event: { payload: unknown }) => void>();
const listenMock = vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
  listenHandlers.set(event, handler);
  return () => {
    listenHandlers.delete(event);
  };
});
const uuidToDbIdMock = vi.fn();
const conversations: Array<Record<string, unknown>> = [];

const toastWarning = vi.fn();

vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn(), warning: toastWarning },
}));

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: invokeMock,
  listen: listenMock,
  isTauri: false,
  isTauriContext: () => false,
}));

vi.mock('../../stores/chat/chatStore', async (importOriginal) => ({
  ...(await importOriginal<ChatstoreModule>()),
  uuidToDbId: uuidToDbIdMock,
  dbIdToUuid: (dbId: number) => `frontend-${dbId}`,
  resolveDesktopChatOwnerId: () => 'user-123',
  useChatStore: {
    getState: () => ({ linkConversationId: vi.fn(), conversations }),
  },
}));

vi.mock('../../stores/auth', async (importOriginal) => ({
  ...(await importOriginal<AuthModule>()),
  useUnifiedAuthStore: { getState: () => ({ user: { id: 'user-123' } }) },
}));

vi.mock('../../stores/appModeStore', async (importOriginal) => ({
  ...(await importOriginal<AppmodestoreModule>()),
  useAppModeStore: { getState: () => ({ mode: 'local' }), subscribe: () => () => {} },
  selectPrivacyMode: (state: { mode: string }) => (state.mode === 'local' ? 'local' : 'managed'),
}));

vi.mock('../../stores/settingsStore', async (importOriginal) => ({
  ...(await importOriginal<SettingsstoreModule>()),
  useSettingsStore: {
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
}));

const { TauriRuntime } = await import('../TauriRuntime');

const [visionModelId] = Object.entries(modelsCatalog.models).find(
  ([, metadata]) => metadata.capabilities.vision,
)!;
const [textOnlyModelId] = Object.entries(modelsCatalog.models).find(
  ([, metadata]) => !metadata.capabilities.vision,
)!;

function streamTurn(conversationId: number, script: () => void) {
  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'chat_send_message') {
      setTimeout(script, 0);
      return { user_message: { id: 31 } };
    }
    return undefined;
  });
  return conversationId;
}

describe('TauriRuntime Local history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenHandlers.clear();
    conversations.length = 0;
    uuidToDbIdMock.mockReturnValue(42);
  });

  it('takes its attachment limits from the shared attachment policy', () => {
    const policy = new TauriRuntime().attachmentPolicy;

    expect(policy.maxFiles).toBe(MAX_CHAT_ATTACHMENT_COUNT);
    expect(policy.maxTotalBytes).toBe(MAX_CHAT_ATTACHMENT_BYTES);
    expect(
      policy.validate(new File(['x'], 'tool.exe', { type: 'application/x-msdownload' })),
    ).toMatch(/not supported/);
    expect(policy.validate(new File(['x'], 'notes.md', { type: 'text/markdown' }))).toBeNull();
  });

  it('tells the user a text-only model cannot read the attached image instead of sending it', async () => {
    const events: Array<{ type: string; error?: string }> = [];
    const runtime = new TauriRuntime();
    runtime.onStream((event) => events.push(event as { type: string; error?: string }));

    await runtime.sendMessage('frontend-42', 'What is in this picture?', {
      model: textOnlyModelId,
      attachments: [new File(['png'], 'photo.png', { type: 'image/png' })],
    });

    expect(invokeMock.mock.calls.map(([command]) => command)).not.toContain('chat_send_message');
    expect(events).toEqual([
      expect.objectContaining({
        type: 'error',
        error: expect.stringMatching(/cannot read images/),
      }),
    ]);
  });

  it('sends images to a vision model', async () => {
    streamTurn(42, () =>
      listenHandlers.get('chat:stream-end')?.({ payload: { conversation_id: 42 } }),
    );

    await new TauriRuntime().sendMessage('frontend-42', 'Describe it', {
      model: visionModelId,
      attachments: [new File(['png'], 'photo.png', { type: 'image/png' })],
    });

    expect(invokeMock.mock.calls.map(([command]) => command)).toContain('chat_send_message');
  });

  it('stores the tool timeline and reasoning on the reply, and the attachment list on the prompt', async () => {
    streamTurn(42, () => {
      listenHandlers.get('thinking:event')?.({
        payload: { event_type: 'delta', content: 'Check the docs.', timestamp: 2 },
      });
      listenHandlers.get('tool:event')?.({
        payload: {
          type: 'started',
          id: 'tool-1',
          conversation_id: 42,
          tool_name: 'web_search',
          arguments: { query: 'tauri' },
        },
      });
      listenHandlers.get('tool:event')?.({
        payload: {
          type: 'completed',
          id: 'tool-1',
          conversation_id: 42,
          tool_name: 'web_search',
          success: true,
          output: 'three results',
          error: null,
        },
      });
      listenHandlers.get('chat:sources')?.({
        payload: {
          conversation_id: 42,
          kind: 'web_search',
          tool_call_id: 'tool-1',
          query: 'tauri',
          sources: [{ title: 'Tauri', url: 'https://tauri.app/', snippet: 'Build small apps' }],
        },
      });
      listenHandlers.get('chat:stream-end')?.({
        payload: { conversation_id: 42, backend_message_id: 32 },
      });
    });

    await new TauriRuntime().sendMessage('frontend-42', 'Search for it', {
      model: visionModelId,
      userMessageId: 'user-client-id',
      assistantMessageId: 'assistant-client-id',
      attachments: [new File(['abc'], 'notes.txt', { type: 'text/plain' })],
    });

    expect(invokeMock).toHaveBeenCalledWith('chat_save_message_detail', {
      messageId: 31,
      userId: 'user-123',
      clientId: 'user-client-id',
      toolCalls: null,
      thinking: null,
      attachments: [{ id: '0:notes.txt', name: 'notes.txt', type: 'file', size: 3 }],
      sources: null,
    });
    expect(invokeMock).toHaveBeenCalledWith('chat_save_message_detail', {
      messageId: 32,
      userId: 'user-123',
      clientId: 'assistant-client-id',
      toolCalls: [
        {
          id: 'tool-1',
          name: 'web_search',
          args: { query: 'tauri' },
          status: 'completed',
          result: 'three results',
        },
      ],
      thinking: 'Check the docs.',
      attachments: null,
      sources: [
        {
          id: 'tool-1',
          query: 'tauri',
          results: [
            {
              url: 'https://tauri.app/',
              title: 'Tauri',
              snippet: 'Build small apps',
              domain: 'tauri.app',
            },
          ],
          resultCount: 1,
          status: 'completed',
        },
      ],
    });
  });

  it('restores stored turn detail when a chat is reopened', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'chat_get_messages') {
        return [
          {
            id: 5,
            conversation_id: 42,
            role: 'user',
            content: 'Summarize',
            attachments: [{ id: '0:report.pdf', name: 'report.pdf', type: 'file', size: 10 }],
          },
          {
            id: 6,
            conversation_id: 42,
            role: 'assistant',
            content: 'Done',
            thinking: 'Read the report.',
            tool_calls: [{ id: 't', name: 'read_file', args: {}, status: 'running' }, 'junk'],
          },
        ];
      }
      return undefined;
    });

    const [user, assistant] = await new TauriRuntime().loadMessages('frontend-42');

    expect(user?.attachments).toEqual([
      { id: '0:report.pdf', name: 'report.pdf', type: 'file', size: 10 },
    ]);
    expect(assistant?.thinking).toBe('Read the report.');
    expect(assistant?.toolCalls).toEqual([
      { id: 't', name: 'read_file', args: {}, status: 'failed' },
    ]);
  });

  it('deletes replaced rows by stored id or by the id the renderer gave them', async () => {
    invokeMock.mockResolvedValue(undefined);

    await new TauriRuntime().deleteMessages('frontend-42', ['17', 'assistant-client-id']);

    expect(invokeMock).toHaveBeenCalledWith('chat_delete_message', {
      conversationId: 42,
      userId: 'user-123',
      id: 17,
      clientId: null,
    });
    expect(invokeMock).toHaveBeenCalledWith('chat_delete_message', {
      conversationId: 42,
      userId: 'user-123',
      id: null,
      clientId: 'assistant-client-id',
    });
  });

  it('reports a failed delete so a replaced reply does not silently come back', async () => {
    invokeMock.mockRejectedValue(new Error('database is locked'));

    await expect(new TauriRuntime().deleteMessages('frontend-42', ['17'])).rejects.toThrow(
      'database is locked',
    );
    expect(toastError).toHaveBeenCalled();
  });

  it('keeps a temporary chat out of SQLite and out of memory', async () => {
    conversations.push({ id: 'temp-1', incognito: true, title: 'Temporary chat' });
    uuidToDbIdMock.mockReturnValue(undefined);
    streamTurn(-1, () =>
      listenHandlers.get('chat:stream-end')?.({
        payload: { conversation_id: -1, backend_message_id: -1 },
      }),
    );

    await new TauriRuntime().sendMessage('temp-1', 'Just between us', {
      model: visionModelId,
      userMessageId: 'u',
      assistantMessageId: 'a',
      messageHistory: [
        { role: 'user', content: 'Remember the code word: heron.' },
        { role: 'assistant', content: 'Noted.' },
        { role: 'user', content: 'Just between us' },
      ],
    });

    const commands = invokeMock.mock.calls.map(([command]) => command);
    expect(commands).not.toContain('chat_create_conversation');
    expect(commands).not.toContain('chat_save_message_detail');
    const send = invokeMock.mock.calls.find(([command]) => command === 'chat_send_message');
    expect(send?.[1]).toEqual({
      request: expect.objectContaining({
        incognito: true,
        conversationId: undefined,
        temporaryHistory: [
          { role: 'user', content: 'Remember the code word: heron.' },
          { role: 'assistant', content: 'Noted.' },
        ],
      }),
    });

    await new TauriRuntime().deleteMessages('temp-1', ['u']);
    expect(invokeMock.mock.calls.map(([command]) => command)).not.toContain('chat_delete_message');
  });

  it('ignores tool events from another conversation and shows tool progress', async () => {
    const events: Array<{
      type: string;
      envelope?: { event: { type: string; summary?: string } };
    }> = [];
    streamTurn(42, () => {
      listenHandlers.get('tool:event')?.({
        payload: { type: 'started', id: 'other', conversation_id: 7, tool_name: 'read_file' },
      });
      listenHandlers.get('tool:event')?.({
        payload: {
          type: 'progress',
          id: 'img',
          conversation_id: 42,
          stdout_chunk: 'Processing the generated image…',
        },
      });
      listenHandlers.get('chat:stream-end')?.({ payload: { conversation_id: 42 } });
    });
    const runtime = new TauriRuntime();
    runtime.onStream((event) => events.push(event as (typeof events)[number]));

    await runtime.sendMessage('frontend-42', 'Draw a heron', { model: visionModelId });

    expect(events.some((event) => event.type === 'tool_call')).toBe(false);
    expect(
      events.some(
        (event) =>
          event.envelope?.event.type === 'progress-update' &&
          event.envelope.event.summary === 'Processing the generated image…',
      ),
    ).toBe(true);
  });

  it('shows the native notice when the routed model skipped attached images', async () => {
    streamTurn(42, () => {
      listenHandlers.get('chat:attachment-notice')?.({
        payload: { conversation_id: 42, notice: 'Model X cannot read images.' },
      });
      listenHandlers.get('chat:attachment-notice')?.({
        payload: { conversation_id: 7, notice: 'Another chat.' },
      });
      listenHandlers.get('chat:stream-end')?.({ payload: { conversation_id: 42 } });
    });

    await new TauriRuntime().sendMessage('frontend-42', 'Look at this');

    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning).toHaveBeenCalledWith('Model X cannot read images.');
  });

  it('puts the native tools-withheld notice in the chat for this conversation only', async () => {
    const events: Array<{ type: string; message?: string }> = [];
    streamTurn(42, () => {
      listenHandlers.get('chat:tools-withheld')?.({
        payload: { conversation_id: 42, notice: 'Tools are off for fixture-local-model.' },
      });
      listenHandlers.get('chat:tools-withheld')?.({
        payload: { conversation_id: 7, notice: 'Another chat.' },
      });
      listenHandlers.get('chat:stream-end')?.({ payload: { conversation_id: 42 } });
    });
    const runtime = new TauriRuntime();
    runtime.onStream((event) => events.push(event as (typeof events)[number]));

    await runtime.sendMessage('frontend-42', 'List my files');

    expect(events.filter((event) => event.type === 'notice')).toEqual([
      { type: 'notice', message: 'Tools are off for fixture-local-model.' },
    ]);
  });
});
