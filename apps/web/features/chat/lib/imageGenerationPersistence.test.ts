import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mirrors lib/hooks/__tests__/useChatStream.save.test.ts's mocking convention:
// stub the deps saveMessageToDb/notifyPersistenceFailure actually use (csrf
// header builder, sonner toast, Clerk) so importing the real useChatStream
// module (and this module, which re-exports from it) doesn't pull in Clerk's
// runtime or zustand store wiring.
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
}));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }));

import {
  isTemporaryConversationById,
  persistImageGenerationUserMessage,
  persistImageGenerationAssistantMessage,
} from './imageGenerationPersistence';
import { EMPTY_ASSISTANT_CONTENT_PLACEHOLDER } from '@/lib/hooks/useChatStream';
import type { MessageMetadata } from '@/stores/chatStore';

const TOK = async () => 'tok';
const USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000101';
const SAVED_USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000102';
const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000201';
const SAVED_ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000202';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  const init = call?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}'));
}

describe('isTemporaryConversationById', () => {
  it('is true when the conversation is flagged temporary', () => {
    expect(isTemporaryConversationById([{ id: 'c1', isTemporary: true }, { id: 'c2' }], 'c1')).toBe(
      true,
    );
  });

  it('is false for a non-temporary conversation', () => {
    expect(isTemporaryConversationById([{ id: 'c1', isTemporary: false }], 'c1')).toBe(false);
  });

  it('is false when the conversation is not found (never silently treats unknown as temporary)', () => {
    expect(isTemporaryConversationById([{ id: 'other' }], 'missing')).toBe(false);
  });
});

describe('WEB-IMAGE-CHAT-PERSISTENCE-01: persistImageGenerationUserMessage', () => {
  beforeEach(() => {
    toastError.mockReset();
    vi.restoreAllMocks();
  });

  it('saves the prompt as a normal user turn', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: SAVED_USER_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);
    const updateMessage = vi.fn();

    await persistImageGenerationUserMessage({
      conversationId: 'conv-1',
      messageId: USER_MESSAGE_ID,
      content: 'a watercolor fox in a forest',
      getAuthToken: TOK,
      updateMessage,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat/conversations/conv-1/messages');
    const body = lastRequestBody(fetchMock);
    expect(body).toMatchObject({
      id: USER_MESSAGE_ID,
      role: 'user',
      content: 'a watercolor fox in a forest',
    });
    // Server assigned a different id — the store must reconcile to it.
    expect(updateMessage).toHaveBeenCalledWith(USER_MESSAGE_ID, { id: SAVED_USER_MESSAGE_ID });
  });

  it('does not reject and surfaces a toast when the save fails (fire-and-forget contract)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));
    const updateMessage = vi.fn();

    await expect(
      persistImageGenerationUserMessage({
        conversationId: 'conv-1',
        messageId: '00000000-0000-4000-8000-000000000103',
        content: 'prompt',
        getAuthToken: TOK,
        updateMessage,
      }),
    ).resolves.toBeUndefined();

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toMatch(/save your message/i);
    expect(updateMessage).not.toHaveBeenCalled();
  });
});

describe('WEB-IMAGE-CHAT-PERSISTENCE-01: persistImageGenerationAssistantMessage', () => {
  beforeEach(() => {
    toastError.mockReset();
    vi.restoreAllMocks();
  });

  const metadata: MessageMetadata = {
    toolType: 'image-generation',
    imageUrl: 'https://blob.example/generated/fox.png',
    imageGenPrompt: 'a watercolor fox in a forest',
    imageGenAspect: 'square',
    imageGenModel: 'imagen-4-ultra',
  };

  it('persists the image card with the zero-width placeholder content (not empty string)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: SAVED_ASSISTANT_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);
    const updateMessage = vi.fn();

    await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: ASSISTANT_MESSAGE_ID,
      model: 'imagen-4-ultra',
      metadata,
      getAuthToken: TOK,
      updateMessage,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastRequestBody(fetchMock);

    // The core regression: content must be the U+200B placeholder, never ''.
    // CreateMessageSchema rejects empty/whitespace-only content server-side —
    // sending '' here would silently drop the whole turn instead of saving it.
    expect(body['content']).toBe(EMPTY_ASSISTANT_CONTENT_PLACEHOLDER);
    expect(body['content']).not.toBe('');
    // U+200B is deliberately NOT stripped by String.prototype.trim() (it's
    // outside the ECMAScript White_Space set) — that's exactly why the schema
    // treats it as non-whitespace content while it renders as nothing.
    expect((body['content'] as string).trim().length).toBe(1);
    expect((body['content'] as string).length).toBe(1);

    // This is what makes reload rehydration work: MessageBubble renders
    // <ImageGenerationCard> exactly when metadata.toolType === 'image-generation',
    // reading imageUrl/imageGenPrompt/imageGenAspect/imageGenModel from it —
    // the saved payload must carry that same shape verbatim.
    expect(body['metadata']).toEqual(metadata);
    expect(body['role']).toBe('assistant');
    expect(body['model']).toBe('imagen-4-ultra');

    expect(updateMessage).toHaveBeenCalledWith(ASSISTANT_MESSAGE_ID, {
      id: SAVED_ASSISTANT_MESSAGE_ID,
    });
  });

  it('upserts via the same message id on regenerate-in-place (idempotent, no duplicate row)', async () => {
    // Regenerate reuses the SAME messageId as the original save — the route's
    // ON CONFLICT contract means this updates the existing row rather than
    // creating a second one for the same visual message.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: ASSISTANT_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);
    const updateMessage = vi.fn();

    await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: ASSISTANT_MESSAGE_ID,
      model: 'imagen-4-ultra',
      metadata: { ...metadata, imageUrl: 'https://blob.example/generated/fox-v2.png' },
      getAuthToken: TOK,
      updateMessage,
    });

    const body = lastRequestBody(fetchMock);
    expect(body['id']).toBe(ASSISTANT_MESSAGE_ID);
    expect((body['metadata'] as MessageMetadata).imageUrl).toBe(
      'https://blob.example/generated/fox-v2.png',
    );
    // Same id came back — no reconciliation needed, no duplicate implied.
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('does not reject and surfaces a toast when the save fails (fire-and-forget contract)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));
    const updateMessage = vi.fn();

    await expect(
      persistImageGenerationAssistantMessage({
        conversationId: 'conv-1',
        messageId: '00000000-0000-4000-8000-000000000203',
        model: 'imagen-4-ultra',
        metadata,
        getAuthToken: TOK,
        updateMessage,
      }),
    ).resolves.toBeUndefined();

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0]?.[0])).toMatch(/save this response/i);
  });
});
