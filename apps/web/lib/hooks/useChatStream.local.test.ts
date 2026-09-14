import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopRuntimeEvent,
  DesktopRuntimeResponse,
  HostBridge,
  LocalChatResult,
} from '@agiworkforce/local-runtime-contract';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useLocalModelSelection } from '@features/desktop-host';
import { useChatStream } from './useChatStream';
import { hostBridgeStub } from '@/test/host-bridge-stub';

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: authMocks.getToken }) }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));

const CONVERSATION_ID = 'conv-local';
const LOCAL_MODEL = {
  id: 'local:ollama/tiny-chat:1b',
  serverId: 'ollama' as const,
  serverLabel: 'Ollama',
  name: 'tiny-chat:1b',
};

const runtimeListeners = new Set<(event: DesktopRuntimeEvent) => void>();
let chatOutcome: LocalChatResult;

function emit(event: DesktopRuntimeEvent): void {
  for (const listener of runtimeListeners) listener(event);
}

function installHost(): void {
  const host: HostBridge = {
    ...hostBridgeStub(),
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    async invokeRuntime<T>(command: string, args?: Record<string, unknown>) {
      if (command === 'local_chat_start') {
        const runId = String(args?.['runId']);
        emit({ kind: 'local-chat-delta', runId, channel: 'text', delta: 'Hello from ' });
        emit({ kind: 'local-chat-delta', runId, channel: 'text', delta: 'this Mac' });
        return { ok: true, value: { ...chatOutcome, runId } as T } as DesktopRuntimeResponse<T>;
      }
      return { ok: true, value: undefined as T };
    },
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent(callback) {
      runtimeListeners.add(callback);
      return () => runtimeListeners.delete(callback);
    },
    openExternal: async () => undefined,
    notify: async () => undefined,
    checkForUpdate: async () => ({
      available: false,
      currentVersion: '1.2.0',
      version: '1.2.0',
      downloadUrl: '',
    }),
    openUpdateInstaller: async () => undefined,
  };
  window.agiHost = host;
}

function seedConversation(): void {
  useChatStore.getState().reset();
  useChatStore.setState({
    activeConversationId: CONVERSATION_ID,
    conversations: [
      {
        id: CONVERSATION_ID,
        title: 'Local chat',
        createdAt: '2026-09-13T00:00:00.000Z',
        updatedAt: '2026-09-13T00:00:00.000Z',
      },
    ],
  });
}

function assistantMessage() {
  return useChatStore
    .getState()
    .messages.filter((message) => message.role === 'assistant')
    .at(-1);
}

beforeEach(() => {
  runtimeListeners.clear();
  seedConversation();
  useLocalModelSelection.getState().select(LOCAL_MODEL);
  chatOutcome = {
    runId: 'run',
    modelId: LOCAL_MODEL.id,
    serverId: 'ollama',
    text: 'Hello from this Mac',
    thinking: '',
    stopReason: 'end_turn',
    durationMs: 12,
  };
  authMocks.getToken.mockResolvedValue('session-token');
  installHost();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  useLocalModelSelection.getState().select(null);
  delete window.agiHost;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a turn on a model installed on this machine', () => {
  it('never calls the managed completions route or any other endpoint', async () => {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: CONVERSATION_ID });
    });

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('streams the answer into the transcript', async () => {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: CONVERSATION_ID });
    });

    expect(assistantMessage()?.content).toBe('Hello from this Mac');
    expect(assistantMessage()?.isStreaming).toBe(false);
  });

  it('labels the turn Local and records no usage figures', async () => {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: CONVERSATION_ID });
    });

    const metadata = assistantMessage()?.metadata;
    expect(metadata?.privacyMode).toBe('local');
    expect(metadata?.providerMode).toBe('Local');
    expect(metadata?.provider).toBe('Ollama');
    expect(metadata?.tokensUsed).toBeUndefined();
    expect(metadata?.inputTokens).toBeUndefined();
    expect(metadata?.outputTokens).toBeUndefined();
    expect(metadata?.cost).toBeUndefined();
  });

  it('surfaces a local server failure rather than reporting a finished turn', async () => {
    chatOutcome = { ...chatOutcome, stopReason: 'error', message: 'model not found' };
    const { result } = renderHook(() => useChatStream());
    let sent = true;
    await act(async () => {
      sent = await result.current.sendMessage('hi', { conversationId: CONVERSATION_ID });
    });

    expect(sent).toBe(false);
    expect(useChatStore.getState().error).toBe('model not found');
  });

  it('refuses an attachment instead of quietly dropping it', async () => {
    const { result } = renderHook(() => useChatStream());
    let sent = true;
    await act(async () => {
      sent = await result.current.sendMessage('look at this', {
        conversationId: CONVERSATION_ID,
        attachments: [{ id: 'a1', name: 'notes.txt', type: 'file', size: 4, url: 'blob:x' }],
      });
    });

    expect(sent).toBe(false);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(useChatStore.getState().error).toContain('cannot read attachments');
  });
});

describe('a local model the page names for the turn', () => {
  it('routes locally on the id alone, with nothing selected in the composer', async () => {
    useLocalModelSelection.getState().select(null);
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', {
        conversationId: CONVERSATION_ID,
        model: LOCAL_MODEL.id,
      });
    });

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(assistantMessage()?.content).toBe('Hello from this Mac');
    expect(assistantMessage()?.metadata?.privacyMode).toBe('local');
  });

  it('still calls the cloud when the page names a catalogue model', async () => {
    useLocalModelSelection.getState().select(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network stub')));
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', {
        conversationId: CONVERSATION_ID,
        model: 'a-managed-catalogue-id',
      });
    });

    expect(vi.mocked(fetch)).toHaveBeenCalled();
    expect(assistantMessage()?.metadata?.privacyMode).toBeUndefined();
  });
});

describe('leaving the local boundary', () => {
  it('refuses a cloud turn in a chat that already holds a local answer', async () => {
    const { result } = renderHook(() => useChatStream());
    await act(async () => {
      await result.current.sendMessage('hi', { conversationId: CONVERSATION_ID });
    });

    useLocalModelSelection.getState().select(null);

    let sent = true;
    await act(async () => {
      sent = await result.current.sendMessage('now use the cloud', {
        conversationId: CONVERSATION_ID,
      });
    });

    expect(sent).toBe(false);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(useChatStore.getState().error).toContain('Start a new chat');
  });
});
