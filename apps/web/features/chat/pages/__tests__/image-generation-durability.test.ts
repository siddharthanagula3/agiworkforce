import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: async () => 'fixture-token' }) }));

import { runDurableImageGenerationTurn } from '../../lib/durableImageGenerationTurn';
import {
  persistImageGenerationAssistantMessage,
  persistImageGenerationUserMessage,
  requireImageMessagePersistence,
} from '../../lib/imageGenerationPersistence';
import type { MessageMetadata } from '@shared/stores/web-chat-store';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000301';
const USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000302';
const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000303';
const GENERATED_ASSET_URL = '/api/files/00000000-0000-4000-8000-000000000304';
const getAuthToken = async () => 'fixture-token';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(call: unknown[]): string {
  return String(call[0]);
}

function requestBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}'));
}

describe('WebChatPage image durability boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('never reaches the intercepted media route after the user-row save is refused', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/messages')) {
        return jsonResponse(403, { error: { message: 'intercepted save refusal' } });
      }
      if (url === '/api/media/image/generate') {
        return jsonResponse(200, { url: GENERATED_ASSET_URL });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = vi.fn(async () => {
      await fetch('/api/media/image/generate', { method: 'POST' });
      return GENERATED_ASSET_URL;
    });

    const outcome = await runDurableImageGenerationTurn({
      mode: 'new',
      temporary: false,
      persistPrompt: async () => {
        requireImageMessagePersistence(
          await persistImageGenerationUserMessage({
            conversationId: CONVERSATION_ID,
            messageId: USER_MESSAGE_ID,
            content: 'synthetic image prompt',
            getAuthToken,
            updateMessage: vi.fn(),
          }),
        );
      },
      beforeGenerate: vi.fn(),
      generate: provider,
      onGenerated: vi.fn(),
      persistResult: vi.fn(),
    });

    expect(outcome.status).toBe('prompt-persistence-failed');
    expect(provider).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(requestUrl)).not.toContain('/api/media/image/generate');
  });

  it('retries only the same assistant row and asset after the result save is refused', async () => {
    let assistantSaveAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/media/image/generate') {
        return jsonResponse(200, { url: GENERATED_ASSET_URL });
      }
      if (url.includes('/messages')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        if (body['role'] === 'user') {
          return jsonResponse(200, { message: { id: USER_MESSAGE_ID } });
        }
        assistantSaveAttempts += 1;
        if (assistantSaveAttempts === 1) {
          return jsonResponse(403, { error: { message: 'intercepted assistant save refusal' } });
        }
        return jsonResponse(200, { message: { id: ASSISTANT_MESSAGE_ID } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = vi.fn(async () => {
      const response = await fetch('/api/media/image/generate', { method: 'POST' });
      const body = (await response.json()) as { url: string };
      return body.url;
    });
    const metadataFor = (imageUrl: string): MessageMetadata => ({
      toolType: 'image-generation',
      imageUrl,
      imageGenPrompt: 'synthetic image prompt',
      imageGenAspect: '1:1',
    });

    const outcome = await runDurableImageGenerationTurn({
      mode: 'new',
      temporary: false,
      persistPrompt: async () => {
        requireImageMessagePersistence(
          await persistImageGenerationUserMessage({
            conversationId: CONVERSATION_ID,
            messageId: USER_MESSAGE_ID,
            content: 'synthetic image prompt',
            getAuthToken,
            updateMessage: vi.fn(),
          }),
        );
      },
      beforeGenerate: vi.fn(),
      generate: provider,
      onGenerated: vi.fn(),
      persistResult: async (imageUrl) => {
        requireImageMessagePersistence(
          await persistImageGenerationAssistantMessage({
            conversationId: CONVERSATION_ID,
            messageId: ASSISTANT_MESSAGE_ID,
            model: undefined,
            metadata: metadataFor(imageUrl),
            getAuthToken,
            updateMessage: vi.fn(),
          }),
        );
      },
    });

    expect(outcome).toMatchObject({
      status: 'result-persistence-failed',
      imageUrl: GENERATED_ASSET_URL,
    });

    requireImageMessagePersistence(
      await persistImageGenerationAssistantMessage({
        conversationId: CONVERSATION_ID,
        messageId: ASSISTANT_MESSAGE_ID,
        model: undefined,
        metadata: metadataFor(GENERATED_ASSET_URL),
        getAuthToken,
        updateMessage: vi.fn(),
      }),
    );

    const mediaCalls = fetchMock.mock.calls.filter(
      (call) => requestUrl(call) === '/api/media/image/generate',
    );
    const assistantSaveCalls = fetchMock.mock.calls.filter((call) => {
      if (!requestUrl(call).includes('/messages')) return false;
      return requestBody(call)['role'] === 'assistant';
    });
    expect(mediaCalls).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(assistantSaveCalls).toHaveLength(2);
    for (const call of assistantSaveCalls) {
      expect(requestBody(call)).toMatchObject({
        id: ASSISTANT_MESSAGE_ID,
        metadata: {
          imageUrl: GENERATED_ASSET_URL,
        },
      });
    }
  });
});
