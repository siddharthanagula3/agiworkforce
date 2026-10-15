import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_QUOTA_COMPLETIONS_PATH,
  FREE_QUOTA_FALLBACK_REQUEST_KEY,
} from '@agiworkforce/cloud-contracts';
import { CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE } from '@agiworkforce/compliance';
import { getProviderOfferings, getRoutingSlotModel } from '@agiworkforce/types';
import { NAMED_PROVIDER_CONSENT_REQUIRED_EVENT } from '@/features/models/lib/named-provider-consent-client';
import { freeModelHandoffReplay } from '@/features/chat/lib/free-model-handoff';
import { useChatStore, type Attachment } from '@shared/stores/web-chat-store';
import { useModelStore } from '@shared/stores/model-store';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useFreeTrialStore } from '@/features/chat/stores/freeTrialStore';
import { useChatStream } from './useChatStream';

type ScanModule0 = typeof import('@/lib/client/csrf');

const authMocks = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: authMocks.getToken,
    userId: 'user-1',
    isSignedIn: true,
    isLoaded: true,
  }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getCsrfToken: async () => 'csrf-token',
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const NORMAL_COMPLETIONS_PATH = '/api/llm/v1/chat/completions';
const offerings = Object.entries(getProviderOfferings());
const [FREE_MODEL] = offerings.find(
  ([, offering]) =>
    offering.provider === 'qwen' &&
    offering.quotaProbeProtocol === 'chat' &&
    offering.identityStatus === 'exact' &&
    offering.quotaChatImageInput !== true,
)!;
const [FREE_VISION_MODEL] = offerings.find(
  ([, offering]) =>
    offering.provider === 'qwen' &&
    offering.quotaProbeProtocol === 'chat' &&
    offering.identityStatus === 'exact' &&
    offering.quotaChatImageInput === true,
)!;
const FREE_DEFAULT = getRoutingSlotModel('free_workhorse');
const CONVERSATION = {
  id: 'conv-free-model',
  title: 'Saved chat',
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
  isTemporary: false,
  model: FREE_MODEL,
};
const PDF: Attachment = {
  id: 'attachment-pdf',
  assetId: 'a2d14f7e-0b3d-40c7-952d-987e841033c5',
  type: 'file',
  name: 'report.pdf',
  mimeType: 'application/pdf',
};
const PHOTO: Attachment = {
  id: 'attachment-photo',
  assetId: 'b2d14f7e-0b3d-40c7-952d-987e841033c5',
  type: 'image',
  name: 'photo.png',
  mimeType: 'image/png',
};

interface Turn {
  path: string;
  body: Record<string, unknown>;
}

type SavedMessage = Record<string, unknown>;

const frame = (delta: Record<string, unknown>) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;

function serve(
  respond: (turn: Turn) => Response = () =>
    new Response(`${frame({ content: 'An answer.' })}data: [DONE]\n\n`, { status: 200 }),
) {
  const turns: Turn[] = [];
  const saves: SavedMessage[] = [];
  const conversationWrites: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === NORMAL_COMPLETIONS_PATH || path === FREE_QUOTA_COMPLETIONS_PATH) {
      const turn = { path, body: JSON.parse(String(init?.body ?? '{}')) as Turn['body'] };
      turns.push(turn);
      return respond(turn);
    }
    if (path.endsWith('/messages')) {
      const saved = JSON.parse(String(init?.body ?? '{}')) as SavedMessage;
      saves.push(saved);
      return new Response(JSON.stringify({ message: { id: saved['id'] } }), { status: 200 });
    }
    if (path.startsWith('/api/chat/conversations/') && init?.method && init.method !== 'GET') {
      conversationWrites.push(`${init.method} ${path}`);
    }
    return new Response('{}', { status: 200 });
  });
  return {
    turns,
    conversationWrites,
    assistantSaves: () => saves.filter((saved) => saved['role'] === 'assistant'),
  };
}

async function send(content: string, options: Record<string, unknown> = {}) {
  const { result } = renderHook(() => useChatStream());
  await act(async () => {
    await result.current.sendMessage(content, {
      conversationId: CONVERSATION.id,
      model: FREE_MODEL,
      ...options,
    });
  });
}

function lastUser() {
  return useChatStore
    .getState()
    .messagesByConversation[CONVERSATION.id]?.findLast((entry) => entry.role === 'user');
}

function lastAssistant() {
  return useChatStore
    .getState()
    .messagesByConversation[CONVERSATION.id]?.findLast((entry) => entry.role === 'assistant');
}

describe('a message sent with a free model selected', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useThinkingStore.getState().setEnabled(false);
    useFreeTrialStore.getState().clearLimitReached();
    useChatStore.setState({
      activeConversationId: CONVERSATION.id,
      conversations: [CONVERSATION],
    });
    useModelStore.getState().setSelectedModelId(FREE_MODEL);
    authMocks.getToken.mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    'What is the latest version of React?',
    'Search the web for the official IANA page and cite it.',
    'Summarize https://www.iana.org/help/example-domains.',
    'Write a Python script to parse a CSV.',
  ])('goes to the free model when it only reads like a tool request: %s', async (question) => {
    const server = serve();

    await send(question);

    expect(server.turns).toHaveLength(1);
    expect(server.turns[0]!.path).toBe(FREE_QUOTA_COMPLETIONS_PATH);
    expect(server.turns[0]!.body['model']).toBe(FREE_MODEL);
    expect(lastAssistant()?.model).toBe(FREE_MODEL);
    expect(lastAssistant()?.fallbackReason).toBeUndefined();
  });

  it('carries no search or page flag to the free route, even when an earlier turn had them on', async () => {
    const server = serve();

    await send('And the one before that?', { webSearch: true, webFetch: true });

    const { body, path } = server.turns[0]!;
    expect(path).toBe(FREE_QUOTA_COMPLETIONS_PATH);
    expect(body).not.toHaveProperty('web_search');
    expect(body).not.toHaveProperty('web_fetch');
  });

  it('hands a requested web search to Auto through the normal route, as that turn would be sent with Auto picked', async () => {
    const server = serve();

    await send('IANA example domains', { searchRequested: true, webSearch: true, webFetch: true });

    expect(server.turns).toHaveLength(1);
    const { body, path } = server.turns[0]!;
    expect(path).toBe(NORMAL_COMPLETIONS_PATH);
    expect(body['model']).toBe(FREE_DEFAULT);
    expect(body['search_requested']).toBe(true);
    expect(body['web_search']).toBe(true);
    expect(body['web_fetch']).toBe(true);
    expect(body['messages']).toEqual([{ role: 'user', content: 'IANA example domains' }]);
  });

  it('shows and saves a note that names why another model answered', async () => {
    const server = serve();

    await send('IANA example domains', { searchRequested: true });

    const reply = lastAssistant();
    expect(reply?.content).toBe('An answer.');
    expect(reply?.model).toBe(FREE_DEFAULT);
    expect(reply?.requestedModel).toBe(FREE_MODEL);
    expect(reply?.fallbackReason).toBe('free_model_web_search');
    await vi.waitFor(() => expect(server.assistantSaves()).not.toHaveLength(0));
    for (const saved of server.assistantSaves()) {
      expect((saved['metadata'] as Record<string, unknown>)['fallbackReason']).toBe(
        'free_model_web_search',
      );
    }
  });

  it('keeps its own reason when the server also names a substitution', async () => {
    serve(
      () =>
        new Response(`${frame({ content: 'An answer.' })}data: [DONE]\n\n`, {
          status: 200,
          headers: new Headers({ 'X-AGI-Fallback-Reason': 'managed_failover' }),
        }),
    );

    await send('IANA example domains', { searchRequested: true });

    expect(lastAssistant()?.fallbackReason).toBe('free_model_web_search');
  });

  it('keeps the server reason that Deep Research did not run, which the hand-over reason would hide', async () => {
    serve(
      () =>
        new Response(`${frame({ content: 'An answer.' })}data: [DONE]\n\n`, {
          status: 200,
          headers: new Headers({ 'X-AGI-Fallback-Reason': 'research_unsupported_model' }),
        }),
    );

    await send('Research the history of example domains.', { research: true });

    expect(lastAssistant()?.fallbackReason).toBe('research_unsupported_model');
    expect(lastAssistant()?.requestedModel).toBe(FREE_MODEL);
  });

  it('answers a regenerated /search through Auto with the search again, from what the first send saved', async () => {
    const server = serve();
    await send('IANA example domains', { searchRequested: true, webSearch: true });
    const asked = lastUser();
    expect(asked?.metadata?.freeModelHandoff).toBe('free_model_web_search');
    expect(server.turns[0]!.body['user_message']).toMatchObject({
      id: asked!.id,
      metadata: { freeModelHandoff: 'free_model_web_search' },
    });

    await send('IANA example domains', {
      webSearch: asked?.metadata?.sendReplay?.webSearchEnabled,
      ...freeModelHandoffReplay(asked?.metadata),
      regenerateParentMessageId: asked!.id,
    });

    expect(server.turns).toHaveLength(2);
    const { body, path } = server.turns[1]!;
    expect(path).toBe(NORMAL_COMPLETIONS_PATH);
    expect(body['model']).toBe(FREE_DEFAULT);
    expect(body['search_requested']).toBe(true);
    expect(body['web_search']).toBe(true);
    expect(lastAssistant()?.fallbackReason).toBe('free_model_web_search');
    expect(lastAssistant()?.requestedModel).toBe(FREE_MODEL);
  });

  it('replays a plain question to the free model, with no search asked for', async () => {
    const server = serve();
    await send('Which planet has the most moons?');
    const asked = lastUser();

    expect(asked?.metadata?.freeModelHandoff).toBeUndefined();
    expect(freeModelHandoffReplay(asked?.metadata)).toEqual({});
    await send('Which planet has the most moons?', {
      ...freeModelHandoffReplay(asked?.metadata),
      regenerateParentMessageId: asked!.id,
    });

    expect(server.turns[1]!.path).toBe(FREE_QUOTA_COMPLETIONS_PATH);
    expect(server.turns[1]!.body).not.toHaveProperty('search_requested');
  });

  it('gives a handed-over file turn the search flag that turn would carry with Auto picked', async () => {
    const server = serve();

    await send('Summarize this report.', { attachments: [PDF], webSearch: true });

    expect(server.turns[0]!.path).toBe(NORMAL_COMPLETIONS_PATH);
    expect(server.turns[0]!.body['web_search']).toBe(true);
    expect(server.turns[0]!.body).not.toHaveProperty('search_requested');
  });

  it('sends the question after a handed-over file to the free model with the file left out and marked as left out', async () => {
    const server = serve();

    await send('Summarize this report.', { attachments: [PDF] });
    await send('What does section 2 of the report say?');

    expect(server.turns.map((turn) => turn.path)).toEqual([
      NORMAL_COMPLETIONS_PATH,
      FREE_QUOTA_COMPLETIONS_PATH,
    ]);
    const [earlier] = server.turns[1]!.body['messages'] as { role: string; content: string }[];
    expect(earlier!.role).toBe('user');
    expect(earlier!.content).toContain('Summarize this report.');
    expect(earlier!.content).toMatch(/attachment in this earlier message is unavailable/i);
    expect(JSON.stringify(server.turns[1]!.body)).not.toContain(PDF.assetId);
  });

  it('leaves the conversation and the picker on the free model, so the next message goes back to it', async () => {
    const server = serve();

    await send('IANA example domains', { searchRequested: true });
    await send('Thanks. What is an example domain for?');

    expect(server.turns.map((turn) => [turn.path, turn.body['model']])).toEqual([
      [NORMAL_COMPLETIONS_PATH, FREE_DEFAULT],
      [FREE_QUOTA_COMPLETIONS_PATH, FREE_MODEL],
    ]);
    expect(useModelStore.getState().selectedModelId).toBe(FREE_MODEL);
    expect(
      useChatStore.getState().conversations.find((entry) => entry.id === CONVERSATION.id)?.model,
    ).toBe(FREE_MODEL);
    expect(server.conversationWrites).toEqual([]);
  });

  it.each([
    ['research mode', { research: true }, 'free_model_research'],
    ['Run code', { codeExecution: true }, 'free_model_code_execution'],
    ['an Office file', { officeCreation: true }, 'free_model_office_file'],
    ['a skill', { skillName: 'fixture-skill' }, 'free_model_skill'],
    [
      'a connected app prompt',
      {
        mcpContext: { prompt: { connectorId: 'fixture', name: 'summary', content: 'Summarise.' } },
      },
      'free_model_connected_app',
    ],
    ['a document', { attachments: [PDF] }, 'free_model_file'],
    ['an image the model cannot read', { attachments: [PHOTO] }, 'free_model_image'],
  ] as const)('hands a message with %s to Auto and says so', async (_label, options, reason) => {
    const server = serve();

    await send('Use this.', options);

    expect(server.turns).toHaveLength(1);
    expect(server.turns[0]!.path).toBe(NORMAL_COMPLETIONS_PATH);
    expect(server.turns[0]!.body['model']).toBe(FREE_DEFAULT);
    expect(lastAssistant()?.requestedModel).toBe(FREE_MODEL);
    expect(lastAssistant()?.fallbackReason).toBe(reason);
  });

  it('sends an image to a free model that reads images', async () => {
    const server = serve();

    await send('What is in this photo?', { model: FREE_VISION_MODEL, attachments: [PHOTO] });

    expect(server.turns[0]!.path).toBe(FREE_QUOTA_COMPLETIONS_PATH);
    expect(server.turns[0]!.body['model']).toBe(FREE_VISION_MODEL);
    expect(lastAssistant()?.fallbackReason).toBeUndefined();
  });

  it('never asks for another free model to answer a handed-over message', async () => {
    const server = serve();

    await send('IANA example domains', { searchRequested: true });
    await send('A plain follow-up.', { model: FREE_DEFAULT });

    expect(server.turns[0]!.body).not.toHaveProperty(FREE_QUOTA_FALLBACK_REQUEST_KEY);
    expect(server.turns[1]!.body[FREE_QUOTA_FALLBACK_REQUEST_KEY]).toBe(true);
  });

  it('asks for the provider notice when the free route refuses for want of the agreement', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const required: unknown[] = [];
    const listen = (event: Event) => required.push((event as CustomEvent<unknown>).detail);
    window.addEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, listen);
    const server = serve(() =>
      Response.json(
        {
          error: {
            code: CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE,
            provider_id: 'qwen',
            message: 'Alibaba Qwen (China) runs this model. Read and accept its notice.',
          },
        },
        { status: 403 },
      ),
    );

    await send('Hello');
    window.removeEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, listen);

    expect(server.turns).toHaveLength(1);
    expect(server.turns[0]!.path).toBe(FREE_QUOTA_COMPLETIONS_PATH);
    expect(required).toEqual([{ providerId: 'qwen', modelId: FREE_MODEL }]);
    expect(lastAssistant()?.content).toContain('Read and accept its notice.');
    errorLog.mockRestore();
  });

  it('asks for no notice when the free route refuses for any other reason', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const required: string[] = [];
    const listen = () => required.push('asked');
    window.addEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, listen);
    serve(() =>
      Response.json(
        { error: { code: 'free_quota_unavailable', message: 'Not available right now.' } },
        { status: 503 },
      ),
    );

    await send('Hello');
    window.removeEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, listen);

    expect(required).toEqual([]);
    errorLog.mockRestore();
  });

  it('shows the normal route’s own refusal and does not fall back to the free model', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const server = serve(() =>
      Response.json(
        {
          error: {
            code: 'organization_policy',
            message: 'Your workspace does not allow this model.',
          },
        },
        { status: 403 },
      ),
    );

    await send('Research the history of example domains.', { research: true });

    expect(server.turns).toHaveLength(1);
    expect(server.turns[0]!.path).toBe(NORMAL_COMPLETIONS_PATH);
    expect(lastAssistant()?.content).toContain('Your workspace does not allow this model.');
    expect(lastAssistant()?.fallbackReason).toBeUndefined();
    errorLog.mockRestore();
  });
});
