import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => headers,
  getCsrfToken: async () => 'fixture-csrf-token',
}));
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }));

import {
  isTemporaryConversationById,
  persistImageGenerationUserMessage,
  persistImageGenerationAssistantMessage,
  requireImageMessagePersistence,
} from './imageGenerationPersistence';
import { EMPTY_ASSISTANT_CONTENT_PLACEHOLDER } from '@/lib/hooks/useChatStream';
import type { MessageMetadata } from '@shared/stores/web-chat-store';
import { getModels, isExecutableImageModel, isModelLive } from '@agiworkforce/types';

const TOK = async () => 'tok';
const USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000101';
const SAVED_USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000102';
const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000201';
const SAVED_ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000202';
const IMAGE_MODEL_ID = getModels({
  modelTypes: ['image'],
  requireCapabilities: { imageGen: true },
}).find(isExecutableImageModel)?.id;
const VIDEO_MODEL_ID = getModels({
  modelTypes: ['video'],
  requireCapabilities: { videoGen: true },
}).find((model) => isModelLive(model) && model.deprecated !== true)?.id;
if (!IMAGE_MODEL_ID) throw new Error('Canonical image model fixture is missing');
if (!VIDEO_MODEL_ID) throw new Error('Canonical video model fixture is missing');

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

    const result = await persistImageGenerationUserMessage({
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
    expect(updateMessage).toHaveBeenCalledWith(USER_MESSAGE_ID, { id: SAVED_USER_MESSAGE_ID });
    expect(result).toEqual({ ok: true, messageId: SAVED_USER_MESSAGE_ID });
  });

  it('returns an explicit failure and logs it instead of toasting when the save fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const updateMessage = vi.fn();

    const result = await persistImageGenerationUserMessage({
      conversationId: 'conv-1',
      messageId: '00000000-0000-4000-8000-000000000103',
      content: 'prompt',
      getAuthToken: TOK,
      updateMessage,
    });

    expect(result).toMatchObject({ ok: false });
    expect(() => requireImageMessagePersistence(result)).toThrow(/save message to DB/i);
    expect(toastError).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0]?.[0])).toMatch(/failed to save user message/i);
    expect(updateMessage).not.toHaveBeenCalled();
    consoleError.mockRestore();
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
    imageGenModel: IMAGE_MODEL_ID,
  };

  it('persists the image card with the zero-width placeholder content (not empty string)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: SAVED_ASSISTANT_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);
    const updateMessage = vi.fn();

    const result = await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: ASSISTANT_MESSAGE_ID,
      model: IMAGE_MODEL_ID,
      metadata,
      getAuthToken: TOK,
      updateMessage,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastRequestBody(fetchMock);

    expect(body['content']).toBe(EMPTY_ASSISTANT_CONTENT_PLACEHOLDER);
    expect(body['content']).not.toBe('');
    expect((body['content'] as string).trim().length).toBe(1);
    expect((body['content'] as string).length).toBe(1);

    expect(body['metadata']).toEqual(metadata);
    expect(body['role']).toBe('assistant');
    expect(body['model']).toBe(IMAGE_MODEL_ID);

    expect(updateMessage).toHaveBeenCalledWith(ASSISTANT_MESSAGE_ID, {
      id: SAVED_ASSISTANT_MESSAGE_ID,
    });
    expect(result).toEqual({ ok: true, messageId: SAVED_ASSISTANT_MESSAGE_ID });
  });

  it('upserts via the same message id on regenerate-in-place (idempotent, no duplicate row)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: ASSISTANT_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);
    const updateMessage = vi.fn();

    await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: ASSISTANT_MESSAGE_ID,
      model: IMAGE_MODEL_ID,
      metadata: { ...metadata, imageUrl: 'https://blob.example/generated/fox-v2.png' },
      getAuthToken: TOK,
      updateMessage,
    });

    const body = lastRequestBody(fetchMock);
    expect(body['id']).toBe(ASSISTANT_MESSAGE_ID);
    expect((body['metadata'] as MessageMetadata).imageUrl).toBe(
      'https://blob.example/generated/fox-v2.png',
    );
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('persists a media billing refusal and its exact recovery metadata for reload/cross-device', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: ASSISTANT_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);
    const updateMessage = vi.fn();
    const refusalMetadata: MessageMetadata = {
      toolType: 'video-generation',
      paywall: {
        feature: 'video_generation',
        requiredTier: 'max_15x',
        reason: 'Video generation requires Max 15x.',
        recoveryAction: 'upgrade',
        showUpgradeCta: true,
        showResetTime: false,
        suggestStandardModel: false,
      },
    };

    await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: ASSISTANT_MESSAGE_ID,
      model: VIDEO_MODEL_ID,
      metadata: refusalMetadata,
      content: '',
      getAuthToken: TOK,
      updateMessage,
    });

    const body = lastRequestBody(fetchMock);
    expect(body).toMatchObject({
      id: ASSISTANT_MESSAGE_ID,
      role: 'assistant',
      content: EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
      metadata: refusalMetadata,
    });
  });

  it('persists visible terminal media failure copy instead of replacing it with a placeholder', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { message: { id: ASSISTANT_MESSAGE_ID } }));
    vi.stubGlobal('fetch', fetchMock);

    await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: ASSISTANT_MESSAGE_ID,
      model: undefined,
      metadata: { toolType: 'video-generation' },
      content: 'Video generation failed: provider unavailable',
      getAuthToken: TOK,
      updateMessage: vi.fn(),
    });

    expect(lastRequestBody(fetchMock)['content']).toBe(
      'Video generation failed: provider unavailable',
    );
  });

  it('returns an explicit failure and logs it instead of toasting when the save fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const updateMessage = vi.fn();

    const result = await persistImageGenerationAssistantMessage({
      conversationId: 'conv-1',
      messageId: '00000000-0000-4000-8000-000000000203',
      model: IMAGE_MODEL_ID,
      metadata,
      getAuthToken: TOK,
      updateMessage,
    });

    expect(result).toMatchObject({ ok: false });
    expect(() => requireImageMessagePersistence(result)).toThrow(/save message to DB/i);
    expect(toastError).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0]?.[0])).toMatch(/failed to save assistant message/i);
    expect(updateMessage).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
