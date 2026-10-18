/**
 * Each reply is labelled with the model that answered it.
 *
 * When the Free plan's promoted model is refused by the fair-use guard, the
 * server answers with the Free plan model and names it in X-AGI-Resolved-Model,
 * on success and on an upstream error alike. The panel labelled the reply with
 * the model it asked for, and a reply that failed before streaming carried no
 * model at all, so a reload showed a model that never answered.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelMetadataById, getPickerModels } from '@agiworkforce/types';

const local: Record<string, unknown> = {};

function selected(key: string | string[] | null): Record<string, unknown> {
  if (key === null) return { ...local };
  const keys = Array.isArray(key) ? key : [key];
  return Object.fromEntries(
    keys.filter((entry) => entry in local).map((entry) => [entry, local[entry]]),
  );
}

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(
  readFileSync(join(APP_ROOT, '_locales', 'en', 'messages.json'), 'utf8'),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

function getMessage(key: string, substitutions: string[] = []): string {
  const entry = catalog[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_match, name: string) =>
    (entry.placeholders?.[name.toLowerCase()]?.content ?? '').replace(
      /\$(\d)/g,
      (_digit, index: string) => substitutions[Number(index) - 1] ?? '',
    ),
  );
}

(globalThis as unknown as Record<string, unknown>).chrome = {
  i18n: { getMessage, getUILanguage: () => 'en' },
  storage: {
    local: {
      get: vi.fn((key: string | string[] | null, cb: (items: Record<string, unknown>) => void) =>
        cb(selected(key)),
      ),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(local, items);
        cb?.();
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete local[key];
        cb?.();
      }),
    },
  },
  runtime: { lastError: undefined, id: 'test-extension' },
};

const { streamFreeChat, FREE_TRIAL_MODEL } =
  await import('../src/features/cloud-bridge/freeTrialClient');
const { executeChromeManagedChat, normalizeChromeManagedRoutingMetadata } =
  await import('../src/features/cloud-bridge/managedChatHandler');
const { applyResolvedRoute, resolvedRouteFrom } =
  await import('../src/features/side-panel/answeredModel');
const { buildBubbleWithTools } = await import('../src/features/side-panel/bubbles');
const { applyStreamFailure, hydrateStoredChatMessage } =
  await import('../src/features/side-panel/chat-state');
const { appendBackgroundTurn } = await import('../src/features/background/conversation-history');

type FreeTrialChunk = import('../src/features/cloud-bridge/freeTrialClient').FreeTrialChunk;
type ChromeManagedChatDependencies =
  import('../src/features/cloud-bridge/managedChatHandler').ChromeManagedChatDependencies;
type SidePanelChatMessage = import('../src/features/side-panel/chat-state').SidePanelChatMessage;

const PICKED = getPickerModels().find(
  (model) =>
    model.id !== FREE_TRIAL_MODEL && model.name !== getModelMetadataById(FREE_TRIAL_MODEL)?.name,
)!.id;
const ANSWERED = FREE_TRIAL_MODEL;
const PICKED_NAME = getModelMetadataById(PICKED)!.name;
const ANSWERED_NAME = getModelMetadataById(ANSWERED)!.name;

function sseResponse(headers: Record<string, string>): Response {
  const frame = JSON.stringify({ choices: [{ index: 0, delta: { content: 'hello' } }] });
  return new Response(`data: ${frame}\n\ndata: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream', ...headers },
  });
}

async function collect(gen: AsyncGenerator<FreeTrialChunk>): Promise<FreeTrialChunk[]> {
  const out: FreeTrialChunk[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

function stream(...chunks: FreeTrialChunk[]): AsyncGenerator<FreeTrialChunk> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

function dependencies(chunks: FreeTrialChunk[]): ChromeManagedChatDependencies {
  return {
    getAuthToken: vi.fn(async () => 'token'),
    getModelAccess: vi.fn(async () => ({
      subscriptionTier: 'pro',
      modelIds: getPickerModels().map((model) => model.id),
      allowedAutoModes: ['auto'],
    })) as unknown as ChromeManagedChatDependencies['getModelAccess'],
    streamChat: vi.fn(() => stream(...chunks)),
    onText: vi.fn(),
    onRouting: vi.fn(),
  };
}

function render(message: SidePanelChatMessage): HTMLElement {
  return buildBubbleWithTools(message);
}

function answerLabel(element: HTMLElement): string {
  return element.querySelector('.sp-answer-meta')?.textContent ?? '';
}

afterEach(() => vi.unstubAllGlobals());

describe('the response names the model that ran', () => {
  it('yields the model the header names before the reply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse({ 'X-AGI-Resolved-Model': ANSWERED })),
    );
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'hi' }], 'token', { model: PICKED }),
    );

    expect(chunks[0]).toEqual({ type: 'answered-model', model: ANSWERED });
    expect(chunks.some((chunk) => chunk.type === 'text')).toBe(true);
  });

  it('yields it on an upstream error response too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'upstream failed' } }), {
            status: 502,
            headers: { 'content-type': 'application/json', 'X-AGI-Resolved-Model': ANSWERED },
          }),
      ),
    );
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'hi' }], 'token', { model: PICKED }),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(['answered-model', 'error']);
  });

  it('ignores a header that names no catalog model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse({ 'X-AGI-Resolved-Model': 'not-a-model' })),
    );
    const chunks = await collect(
      streamFreeChat([{ role: 'user', content: 'hi' }], 'token', { model: PICKED }),
    );

    expect(chunks.some((chunk) => chunk.type === 'answered-model')).toBe(false);
  });
});

describe('the managed turn carries the answered model beside the pick', () => {
  it('rebroadcasts the route with the model that answered and keeps the pick', async () => {
    const deps = dependencies([
      { type: 'answered-model', model: ANSWERED },
      { type: 'text', text: 'hello' },
      { type: 'done' },
    ]);
    const result = await executeChromeManagedChat(
      { id: 'stream-1', text: 'Hello', modelSelection: PICKED },
      deps,
    );

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.routing).toMatchObject({
      modelKey: PICKED,
      answeredModel: ANSWERED,
    });
    expect(deps.onRouting).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.onRouting!).mock.calls[1]![0]).toMatchObject({
      modelKey: PICKED,
      answeredModel: ANSWERED,
    });
    expect(deps.onText).toHaveBeenCalledWith('hello');
  });

  it('keeps the answered model on a failed turn', async () => {
    const deps = dependencies([
      { type: 'answered-model', model: ANSWERED },
      { type: 'error', code: 'server_error', message: 'AGI Cloud is temporarily unavailable.' },
    ]);
    const result = await executeChromeManagedChat(
      { id: 'stream-2', text: 'Hello', modelSelection: PICKED },
      deps,
    );

    expect(result).toMatchObject({
      status: 'error',
      code: 'server_error',
      routing: { modelKey: PICKED, answeredModel: ANSWERED },
    });
  });

  it('adds nothing when the model that answered is the one picked', async () => {
    const deps = dependencies([
      { type: 'answered-model', model: PICKED },
      { type: 'text', text: 'hello' },
      { type: 'done' },
    ]);
    const result = await executeChromeManagedChat(
      { id: 'stream-3', text: 'Hello', modelSelection: PICKED },
      deps,
    );

    expect(deps.onRouting).toHaveBeenCalledTimes(1);
    expect(result.status === 'success' && result.routing.answeredModel).toBeUndefined();
  });

  it('accepts a catalog answered model on carried routing and refuses anything else', () => {
    const base = { modelKey: PICKED, taskType: 'general', reason: 'explicit' };
    expect(normalizeChromeManagedRoutingMetadata({ ...base, answeredModel: ANSWERED })).toEqual({
      ...base,
      answeredModel: ANSWERED,
    });
    expect(
      normalizeChromeManagedRoutingMetadata({ ...base, answeredModel: 'not-a-model' }),
    ).toBeNull();
    expect(normalizeChromeManagedRoutingMetadata({ ...base, answeredModel: 7 })).toBeNull();
  });
});

describe('the reply is labelled with the model that answered', () => {
  beforeEach(() => {
    for (const key of Object.keys(local)) delete local[key];
  });

  it('labels a successful reply with the answered model, not the pick', () => {
    const route = resolvedRouteFrom(
      { modelKey: PICKED, reason: 'explicit', answeredModel: ANSWERED },
      () => undefined,
    )!;
    const reply: SidePanelChatMessage = {
      id: 'stream-1',
      role: 'assistant',
      content: 'hello',
      timestamp: 1,
    };
    applyResolvedRoute(reply, route);

    expect(reply.model).toBe(ANSWERED);
    expect(reply.provider).toBe(getModelMetadataById(ANSWERED)!.provider);
    const label = answerLabel(render(reply));
    expect(label).toContain(ANSWERED_NAME);
    expect(label).not.toContain(PICKED_NAME);
  });

  it('falls back to the routed model when nothing else answered', () => {
    expect(resolvedRouteFrom({ modelKey: PICKED, reason: 'explicit' }, () => undefined)).toEqual({
      model: PICKED,
      provider: getModelMetadataById(PICKED)!.provider,
    });
  });

  it('keeps the label after a reload from history', () => {
    const reply = hydrateStoredChatMessage(
      { role: 'assistant', content: 'hello', timestamp: 1, model: ANSWERED },
      'stream-1',
    );
    const label = answerLabel(render(reply));

    expect(label).toContain(ANSWERED_NAME);
    expect(label.toLowerCase()).not.toMatch(/limit|usage|remaining|quota/);
  });

  it('labels a background-delivered reply with the model that answered', async () => {
    const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
    const result = await appendBackgroundTurn(
      owner,
      'bg-task-answered',
      'Task',
      { prompt: 'Summarize', answer: 'Done.', answeredModel: ANSWERED },
      { selectedModel: 'auto', currentModelKey: PICKED },
    );

    const assistant = result?.entry.messages.find((message) => message.role === 'assistant');
    expect(assistant?.model).toBe(ANSWERED);
  });
});

describe('a reply that failed before streaming keeps the answered model', () => {
  const source = readFileSync(join(APP_ROOT, 'src', 'side_panel.ts'), 'utf8');
  const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
  const names = [
    'previousAnswerModel',
    'captureResolvedRoute',
    'stampResolvedRoute',
    'handleStreamError',
  ];
  const functions = program.statements
    .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
    .map((node) => node.getText(program));
  if (functions.length !== names.length)
    throw new Error('Side panel route functions were not found');

  function harness() {
    const context = {
      currentStreamId: 'stream-1' as string | null,
      isStreaming: true,
      streamTimeoutHandle: null,
      messages: [] as SidePanelChatMessage[],
      needsMessageRebuild: false,
    };
    const dependencies = {
      _ctx: context,
      resolvedRouteFrom,
      applyResolvedRoute,
      applyStreamFailure,
      resolvedRouteByStreamId: new Map(),
      quickModeByStreamId: new Map(),
      ownerByStreamId: new Map(),
      assistantCloudIdByStreamId: new Map(),
      streamStartedAtById: new Map(),
      connectorInputResponses: new Map(),
      classifyManagedQuotaErrorCode: () => null,
      quotaResetLabel: () => null,
      streamFailureText: (text: string) => text,
      stopManagedChatKeepalive: vi.fn(),
      removeThinking: vi.fn(),
      trimLiveMessages: vi.fn(),
      updateSendButton: vi.fn(),
      saveMessages: vi.fn(),
      renderMessages: vi.fn(),
      sendNextFollowUp: vi.fn(),
    };
    const compiled = ts.transpileModule(
      `${functions.join('\n')}\nreturn { captureResolvedRoute, handleStreamError };`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
    );
    // llm-guardrail-allow: executes repository-owned side panel code inside this isolated test fixture.
    const api = new Function(...Object.keys(dependencies), compiled.outputText)(
      ...Object.values(dependencies),
    ) as {
      captureResolvedRoute(streamId: string, routing: unknown): boolean;
      handleStreamError(id: string, text: string, code?: string): void;
    };
    return { context, ...api };
  }

  it('stamps the failed reply with the model the server named, and it survives a reload', () => {
    const panel = harness();
    panel.captureResolvedRoute('stream-1', {
      modelKey: PICKED,
      taskType: 'general',
      reason: 'explicit',
      answeredModel: ANSWERED,
    });
    panel.handleStreamError('stream-1', 'AGI Cloud is temporarily unavailable.', 'server_error');

    const failed = panel.context.messages.find((message) => message.id === 'stream-1')!;
    expect(failed.error).toBe(true);
    expect(failed.model).toBe(ANSWERED);
    expect(answerLabel(render(failed))).toContain(ANSWERED_NAME);

    const reloaded = hydrateStoredChatMessage(
      {
        role: 'assistant',
        content: failed.content,
        timestamp: failed.timestamp,
        error: true,
        errorText: failed.errorText,
        model: failed.model,
      },
      failed.id,
    );
    expect(answerLabel(render(reloaded))).toContain(ANSWERED_NAME);
    expect(answerLabel(render(reloaded))).not.toContain(PICKED_NAME);
  });
});
