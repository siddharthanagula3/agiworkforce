import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRequest, ModelInfo, StreamChunk } from '@agiworkforce/types';

const OLLAMA_BASE_URL = 'http://localhost:11434';
const LMSTUDIO_BASE_URL = 'http://localhost:1234/v1';

const ollamaCatalog = vi.fn<() => Promise<ModelInfo[]>>();
const lmstudioCatalog = vi.fn<() => Promise<ModelInfo[]>>();
const streamChunks = vi.fn<(req: ChatRequest, signal: AbortSignal) => AsyncIterable<StreamChunk>>();
const lastStreamCall: { request?: ChatRequest; baseUrl?: string } = {};

vi.mock('@agiworkforce/providers-ollama', () => ({
  OLLAMA_DEFAULT_BASE_URL: OLLAMA_BASE_URL,
  fetchOllamaCatalog: () => ollamaCatalog(),
  createOllamaAdapter: (config: { baseUrl: string }) => ({
    id: 'ollama',
    label: 'Ollama (local)',
    auth: [],
    config,
    catalog: () => ollamaCatalog(),
    stream: (request: ChatRequest, signal: AbortSignal) => {
      lastStreamCall.request = request;
      lastStreamCall.baseUrl = config.baseUrl;
      return streamChunks(request, signal);
    },
  }),
  ollamaAdapterFactory: vi.fn(),
  translateChatRequest: vi.fn(),
  parseOllamaStream: vi.fn(),
  translateOllamaStream: vi.fn(),
}));

vi.mock('@agiworkforce/providers-lmstudio', () => ({
  LMSTUDIO_DEFAULT_BASE_URL: LMSTUDIO_BASE_URL,
  createLMStudioAdapter: (config: { baseUrl: string }) => ({
    id: 'lmstudio',
    label: 'LMStudio',
    auth: [],
    config,
    catalog: () => lmstudioCatalog(),
    stream: (request: ChatRequest, signal: AbortSignal) => {
      lastStreamCall.request = request;
      lastStreamCall.baseUrl = config.baseUrl;
      return streamChunks(request, signal);
    },
  }),
  lmstudioAdapterFactory: vi.fn(),
}));

vi.mock('../runtime/localModelSettingsStore', () => ({
  LOCAL_MODEL_DEFAULT_BASE_URLS: { ollama: OLLAMA_BASE_URL, lmstudio: LMSTUDIO_BASE_URL },
  readLocalModelSettings: () => ({
    baseUrls: { ollama: OLLAMA_BASE_URL, lmstudio: LMSTUDIO_BASE_URL },
  }),
  readLocalBaseUrl: (serverId: string) =>
    serverId === 'ollama' ? OLLAMA_BASE_URL : LMSTUDIO_BASE_URL,
  writeLocalModelSettings: vi.fn(),
}));

const { cancelLocalChat, listLocalModels, listLocalServers, runLocalChat } =
  await import('../runtime/localInferenceService');

async function* chunks(values: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const value of values) {
    yield value;
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  ollamaCatalog.mockResolvedValue([]);
  lmstudioCatalog.mockResolvedValue([]);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('connection refused'))),
  );
});

describe('discovery', () => {
  it('reports a server that answers with models as reachable', async () => {
    ollamaCatalog.mockResolvedValue([
      { id: 'tiny-chat:1b', name: 'tiny-chat:1b', provider: 'ollama', sizeBillion: 1.2 },
    ]);
    const servers = await listLocalServers();
    const ollama = servers.find((server) => server.id === 'ollama');
    expect(ollama).toMatchObject({ reachable: true, modelCount: 1, baseUrl: OLLAMA_BASE_URL });
  });

  it('reports a server nothing answers for as unreachable', async () => {
    const servers = await listLocalServers();
    expect(servers.every((server) => server.reachable === false)).toBe(true);
  });

  it('separates a running server with no models from a missing one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('ok'))),
    );
    const servers = await listLocalServers();
    const ollama = servers.find((server) => server.id === 'ollama');
    expect(ollama?.reachable).toBe(true);
    expect(ollama?.modelCount).toBe(0);
    expect(ollama?.message).toContain('no models loaded');
  });

  it('namespaces every discovered model by its server', async () => {
    ollamaCatalog.mockResolvedValue([{ id: 'tiny-chat:1b', provider: 'ollama' }]);
    lmstudioCatalog.mockResolvedValue([{ id: 'small-chat-4b', provider: 'lmstudio' }]);
    const models = await listLocalModels();
    expect(models.map((model) => model.id)).toEqual([
      'local:ollama/tiny-chat:1b',
      'local:lmstudio/small-chat-4b',
    ]);
    expect(models[0]?.serverLabel).toBe('Ollama');
    expect(models[1]?.serverLabel).toBe('LM Studio');
  });

  it('survives a server that throws while listing', async () => {
    ollamaCatalog.mockRejectedValue(new Error('boom'));
    lmstudioCatalog.mockResolvedValue([{ id: 'small-chat-4b', provider: 'lmstudio' }]);
    await expect(listLocalModels()).resolves.toHaveLength(1);
  });
});

describe('proxying a turn', () => {
  it('streams deltas and returns the accumulated answer', async () => {
    streamChunks.mockReturnValue(
      chunks([
        { type: 'thinking-delta', delta: 'weighing' },
        { type: 'text-delta', delta: 'Hello' },
        { type: 'text-delta', delta: ' there' },
        { type: 'stop', reason: 'end_turn' },
      ]),
    );
    const emitted: { channel: string; delta: string }[] = [];
    const result = await runLocalChat(
      {
        runId: 'run-1',
        modelId: 'local:ollama/tiny-chat:1b',
        messages: [{ role: 'user', content: 'hi' }],
      },
      (delta) => emitted.push({ channel: delta.channel, delta: delta.delta }),
    );

    expect(result.text).toBe('Hello there');
    expect(result.thinking).toBe('weighing');
    expect(result.stopReason).toBe('end_turn');
    expect(result.serverId).toBe('ollama');
    expect(emitted).toEqual([
      { channel: 'thinking', delta: 'weighing' },
      { channel: 'text', delta: 'Hello' },
      { channel: 'text', delta: ' there' },
    ]);
  });

  it('asks the adapter for the bare model name at its own base url', async () => {
    streamChunks.mockReturnValue(chunks([{ type: 'stop', reason: 'end_turn' }]));
    await runLocalChat(
      {
        runId: 'run-2',
        modelId: 'local:lmstudio/small-chat-4b',
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' },
        ],
      },
      () => undefined,
    );
    expect(lastStreamCall.baseUrl).toBe(LMSTUDIO_BASE_URL);
    expect(lastStreamCall.request?.model).toBe('small-chat-4b');
    expect(lastStreamCall.request?.messages).toHaveLength(2);
    expect(lastStreamCall.request?.tools).toBeUndefined();
  });

  it('reports an adapter error without pretending the turn finished', async () => {
    streamChunks.mockReturnValue(
      chunks([
        { type: 'error', message: 'model not found' },
        { type: 'stop', reason: 'error' },
      ]),
    );
    const result = await runLocalChat(
      {
        runId: 'run-3',
        modelId: 'local:ollama/absent-model',
        messages: [{ role: 'user', content: 'x' }],
      },
      () => undefined,
    );
    expect(result.stopReason).toBe('error');
    expect(result.message).toBe('model not found');
  });

  it('refuses a model id that is not a local one', async () => {
    await expect(
      runLocalChat(
        {
          runId: 'run-4',
          modelId: 'managed-catalogue-model',
          messages: [{ role: 'user', content: 'x' }],
        },
        () => undefined,
      ),
    ).rejects.toThrow(/not one of the models found on this machine/);
  });

  it('cancels a run in flight and reports it as cancelled', async () => {
    let aborted = false;
    streamChunks.mockImplementation((_request, signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return (async function* () {
        yield { type: 'text-delta', delta: 'partial' } satisfies StreamChunk;
        await new Promise((resolve) => setTimeout(resolve, 5));
      })();
    });

    const pending = runLocalChat(
      {
        runId: 'run-5',
        modelId: 'local:ollama/tiny-chat:1b',
        messages: [{ role: 'user', content: 'x' }],
      },
      () => cancelLocalChat('run-5'),
    );
    const result = await pending;
    expect(aborted).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(result.text).toBe('partial');
  });

  it('reports nothing to cancel for an unknown run', () => {
    expect(cancelLocalChat('no-such-run')).toBe(false);
  });
});

describe('local turn guards', () => {
  it('counts only models the picker will show', async () => {
    ollamaCatalog.mockResolvedValue([
      { id: 'qwen2.5:1.5b', name: 'qwen2.5:1.5b', provider: 'ollama', sizeBillion: 1.5 },
      { id: 'qwen2.5:0.5b', name: 'qwen2.5:0.5b', provider: 'ollama', sizeBillion: 0.494 },
    ]);
    const servers = await listLocalServers();
    expect(servers.find((server) => server.id === 'ollama')?.modelCount).toBe(1);
  });

  it('refuses a turn on a model under the minimum size', async () => {
    ollamaCatalog.mockResolvedValue([
      { id: 'qwen2.5:0.5b', name: 'qwen2.5:0.5b', provider: 'ollama', sizeBillion: 0.494 },
    ]);
    await expect(
      runLocalChat(
        {
          runId: 'run-small',
          modelId: 'local:ollama/qwen2.5:0.5b',
          messages: [{ role: 'user', content: 'hello' }],
        },
        () => undefined,
      ),
    ).rejects.toThrow('under 1B parameters');
    expect(streamChunks).not.toHaveBeenCalled();
  });

  it('runs a turn on a model at or above the minimum size', async () => {
    ollamaCatalog.mockResolvedValue([
      { id: 'qwen2.5:1.5b', name: 'qwen2.5:1.5b', provider: 'ollama', sizeBillion: 1.5 },
    ]);
    streamChunks.mockImplementation(() =>
      chunks([
        { type: 'text-delta', delta: 'hi' },
        { type: 'stop', reason: 'end_turn' },
      ]),
    );
    const result = await runLocalChat(
      {
        runId: 'run-big',
        modelId: 'local:ollama/qwen2.5:1.5b',
        messages: [{ role: 'user', content: 'hello' }],
      },
      () => undefined,
    );
    expect(result.text).toBe('hi');
  });

  it('refuses attachment bytes smuggled into a message', async () => {
    ollamaCatalog.mockResolvedValue([
      { id: 'qwen2.5:1.5b', name: 'qwen2.5:1.5b', provider: 'ollama', sizeBillion: 1.5 },
    ]);
    await expect(
      runLocalChat(
        {
          runId: 'run-attach',
          modelId: 'local:ollama/qwen2.5:1.5b',
          messages: [{ role: 'user', content: 'data:image/png;base64,iVBORw0KGgo=' }],
        },
        () => undefined,
      ),
    ).rejects.toThrow('cannot read attachments');
    expect(streamChunks).not.toHaveBeenCalled();
  });
});
