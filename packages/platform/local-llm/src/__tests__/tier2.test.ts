import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutorchPreset } from '@agiworkforce/types';
import { getDefaultModel, getLiteModeModel } from '../catalog.js';
import {
  tier2Generate,
  tier2LoadModel,
  tier2Release,
  tier2LoadedPresetName,
  _setLLMModuleForTesting,
  _setPresetDownloadedCheckForTesting,
  Tier2ModelNotDownloadedError,
} from '../tier2.js';

const makeInstance = () => ({
  generate: vi.fn().mockResolvedValue('hello from model'),
  setTokenCallback: vi.fn(),
  configure: vi.fn(),
  interrupt: vi.fn(),
  delete: vi.fn(),
});

let mockInstance = makeInstance();
const mockFromModelName = vi.fn().mockImplementation(() => Promise.resolve(mockInstance));

const mockLLMModule = {
  fromModelName: mockFromModelName,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInstance = makeInstance();
  mockFromModelName.mockImplementation(() => Promise.resolve(mockInstance));
  _setLLMModuleForTesting(mockLLMModule);
  _setPresetDownloadedCheckForTesting(async () => true);
  tier2Release();
});

const DEFAULT_PRESET: ExecutorchPreset = getDefaultModel().executorchPreset!;
const ALTERNATE_PRESET: ExecutorchPreset = getLiteModeModel()!.executorchPreset!;

describe('tier2: LLMModule loading', () => {
  it('calls fromModelName with preset fields on first load', async () => {
    await tier2LoadModel(DEFAULT_PRESET);
    expect(mockFromModelName).toHaveBeenCalledOnce();
    expect(mockFromModelName).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: DEFAULT_PRESET.modelName,
        modelSource: DEFAULT_PRESET.modelSource,
        tokenizerSource: DEFAULT_PRESET.tokenizerSource,
        tokenizerConfigSource: DEFAULT_PRESET.tokenizerConfigSource,
      }),
      undefined,
    );
  });

  it('does not reload if same preset is already loaded', async () => {
    await tier2LoadModel(DEFAULT_PRESET);
    await tier2LoadModel(DEFAULT_PRESET);
    expect(mockFromModelName).toHaveBeenCalledOnce();
  });

  it('deduplicates concurrent loads for the same preset', async () => {
    let resolveLoad: (instance: ReturnType<typeof makeInstance>) => void = () => undefined;
    mockFromModelName.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = tier2LoadModel(DEFAULT_PRESET);
    const second = tier2LoadModel(DEFAULT_PRESET);
    // The native load cannot start synchronously: the download-consent hook is
    // awaited first. What dedup promises is one native load for two callers,
    // not that it begins in the same tick.
    await vi.waitFor(() => expect(mockFromModelName).toHaveBeenCalledOnce());

    resolveLoad(mockInstance);
    await Promise.all([first, second]);
    expect(mockFromModelName).toHaveBeenCalledOnce();
  });

  it('reloads and deletes old instance when switching models', async () => {
    const firstInstance = makeInstance();
    const secondInstance = makeInstance();
    mockFromModelName
      .mockImplementationOnce(() => Promise.resolve(firstInstance))
      .mockImplementationOnce(() => Promise.resolve(secondInstance));

    await tier2LoadModel(DEFAULT_PRESET);
    await tier2LoadModel(ALTERNATE_PRESET);

    expect(mockFromModelName).toHaveBeenCalledTimes(2);
    expect(firstInstance.delete).toHaveBeenCalledOnce();
  });

  it('deletes a late native instance when release happens during load', async () => {
    const lateInstance = makeInstance();
    let resolveLoad: (instance: ReturnType<typeof makeInstance>) => void = () => undefined;
    mockFromModelName.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const pending = tier2LoadModel(DEFAULT_PRESET);
    // resolveLoad is only assigned once the mock is actually invoked, so
    // releasing before that leaves this promise forever pending.
    await vi.waitFor(() => expect(mockFromModelName).toHaveBeenCalled());
    tier2Release();
    resolveLoad(lateInstance);
    await pending;

    expect(lateInstance.delete).toHaveBeenCalledOnce();

    await tier2LoadModel(DEFAULT_PRESET);
    expect(mockFromModelName).toHaveBeenCalledTimes(2);
  });
});

describe('tier2: generate, basic', () => {
  it('returns text from generate()', async () => {
    const result = await tier2Generate(DEFAULT_PRESET, { prompt: 'Hello' });
    expect(result.text).toBe('hello from model');
    expect(result.runtime).toBe('executorch');
    expect(result.aborted).toBe(false);
  });

  it('assembles messages: system, history, user in order', async () => {
    await tier2Generate(DEFAULT_PRESET, {
      prompt: 'What is 2+2?',
      systemPrompt: 'You are a math tutor.',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ],
    });
    const messages = mockInstance.generate.mock.calls[0][0];
    expect(messages[0]).toEqual({ role: 'system', content: 'You are a math tutor.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Hello!' });
    expect(messages[3]).toEqual({ role: 'user', content: 'What is 2+2?' });
  });

  it('installs a lease-scoped callback that ignores tokens after settlement', async () => {
    const onToken = vi.fn();
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi', onToken });
    const { tokenCallback } = mockInstance.setTokenCallback.mock.calls[0][0];
    tokenCallback('late');
    expect(onToken).not.toHaveBeenCalled();
  });

  it('resets token callback to a no-op when no onToken is provided', async () => {
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi' });
    expect(mockInstance.setTokenCallback).toHaveBeenCalledWith({
      tokenCallback: expect.any(Function),
    });
  });

  it('calls onDone after generate resolves', async () => {
    const onDone = vi.fn();
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi', onDone });
    expect(onDone).toHaveBeenCalledWith({ aborted: false });
  });
});

describe('tier2: generate, tools API', () => {
  it('passes tools array to generate()', async () => {
    const tools = [
      {
        name: 'get_weather',
        description: 'Get weather',
        parameters: { type: 'object', properties: {} },
      },
    ];
    await tier2Generate(DEFAULT_PRESET, { prompt: 'What is the weather?', tools });
    expect(mockInstance.generate).toHaveBeenCalledWith(expect.any(Array), tools);
  });

  it('passes undefined tools when no tools provided', async () => {
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi' });
    expect(mockInstance.generate).toHaveBeenCalledWith(expect.any(Array), undefined);
  });

  it('passes multiple tools correctly', async () => {
    const tools = [
      { name: 'search', description: 'Web search' },
      { name: 'calculator', description: 'Math calc' },
    ];
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Search and calc', tools });
    const calledTools = mockInstance.generate.mock.calls[0][1];
    expect(calledTools).toHaveLength(2);
    expect(calledTools[0]).toMatchObject({ name: 'search' });
    expect(calledTools[1]).toMatchObject({ name: 'calculator' });
  });
});

describe('tier2: tier2Release', () => {
  it('deletes the model instance on release', async () => {
    await tier2LoadModel(DEFAULT_PRESET);
    tier2Release();
    expect(mockInstance.delete).toHaveBeenCalledOnce();
  });

  it('does nothing if no model loaded', () => {
    expect(() => tier2Release()).not.toThrow();
    expect(mockInstance.delete).not.toHaveBeenCalled();
  });

  it('after release, next generate re-loads the model', async () => {
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi' });
    tier2Release();
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi again' });
    expect(mockFromModelName).toHaveBeenCalledTimes(2);
  });
});

describe('tier2: cancellation', () => {
  it('interrupts generation when the caller aborts', async () => {
    let resolveGenerate: (text: string) => void = () => undefined;
    mockInstance.generate.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveGenerate = resolve;
        }),
    );

    const controller = new AbortController();
    const pending = tier2Generate(DEFAULT_PRESET, { prompt: 'Hi', signal: controller.signal });
    await vi.waitFor(() => expect(mockInstance.generate).toHaveBeenCalledOnce());
    controller.abort();
    resolveGenerate('late text');

    const result = await pending;
    expect(mockInstance.interrupt).toHaveBeenCalledOnce();
    expect(result).toEqual({ text: '', runtime: 'executorch', aborted: true });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('tier2: exclusive generation lease', () => {
  it('reserves initial loading before a second generation or public mutation', async () => {
    const loading = deferred<ReturnType<typeof makeInstance>>();
    mockFromModelName.mockReturnValueOnce(loading.promise);
    const first = tier2Generate(DEFAULT_PRESET, { prompt: 'first' });

    await expect(tier2Generate(ALTERNATE_PRESET, { prompt: 'second' })).rejects.toThrow('busy');
    await expect(tier2LoadModel(DEFAULT_PRESET)).rejects.toThrow('busy');
    expect(() => tier2Release()).toThrow('busy');
    expect(mockInstance.setTokenCallback).not.toHaveBeenCalled();

    loading.resolve(mockInstance);
    await first;
    expect(mockFromModelName).toHaveBeenCalledOnce();
    tier2Release();
    expect(mockInstance.delete).toHaveBeenCalledOnce();
  });

  it('does not let a rejected overlapping turn steal the active callback', async () => {
    const generating = deferred<string>();
    mockInstance.generate.mockReturnValueOnce(generating.promise);
    const onToken = vi.fn();
    const otherToken = vi.fn();
    const first = tier2Generate(DEFAULT_PRESET, { prompt: 'first', onToken });
    await vi.waitFor(() => expect(mockInstance.generate).toHaveBeenCalledOnce());
    const { tokenCallback } = mockInstance.setTokenCallback.mock.calls[0][0];

    await expect(
      tier2Generate(DEFAULT_PRESET, { prompt: 'second', onToken: otherToken }),
    ).rejects.toThrow('busy');
    await expect(tier2LoadModel(ALTERNATE_PRESET)).rejects.toThrow('busy');
    expect(() => tier2Release()).toThrow('busy');
    tokenCallback('first token');
    expect(onToken).toHaveBeenCalledWith('first token');
    expect(otherToken).not.toHaveBeenCalled();
    expect(mockInstance.setTokenCallback).toHaveBeenCalledOnce();
    expect(mockInstance.delete).not.toHaveBeenCalled();

    generating.resolve('first result');
    await first;
    await tier2Generate(DEFAULT_PRESET, { prompt: 'next', onToken: otherToken });
    tokenCallback('stale token');
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(otherToken).not.toHaveBeenCalled();
  });

  it('suppresses aborted tokens but holds the lease until native settlement', async () => {
    const generating = deferred<string>();
    mockInstance.generate.mockReturnValueOnce(generating.promise);
    const controller = new AbortController();
    const onToken = vi.fn();
    const first = tier2Generate(DEFAULT_PRESET, {
      prompt: 'first',
      signal: controller.signal,
      onToken,
    });
    await vi.waitFor(() => expect(mockInstance.generate).toHaveBeenCalledOnce());
    const { tokenCallback } = mockInstance.setTokenCallback.mock.calls[0][0];
    controller.abort();
    tokenCallback('after abort');
    expect(onToken).not.toHaveBeenCalled();
    expect(mockInstance.interrupt).toHaveBeenCalledOnce();
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'second' })).rejects.toThrow('busy');
    expect(() => tier2Release()).toThrow('busy');
    generating.resolve('late result');
    await expect(first).resolves.toMatchObject({ text: '', aborted: true });
    tier2Release();
    expect(mockInstance.delete).toHaveBeenCalledOnce();
  });

  it('holds the lease when cancellation happens during initial loading', async () => {
    const loading = deferred<ReturnType<typeof makeInstance>>();
    mockFromModelName.mockReturnValueOnce(loading.promise);
    const controller = new AbortController();
    const first = tier2Generate(DEFAULT_PRESET, { prompt: 'first', signal: controller.signal });
    controller.abort();
    expect(() => tier2Release()).toThrow('busy');
    loading.resolve(mockInstance);
    await expect(first).resolves.toMatchObject({ aborted: true });
    expect(mockInstance.generate).not.toHaveBeenCalled();
    tier2Release();
  });

  it('does not load or mutate callbacks for an already aborted turn', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      tier2Generate(DEFAULT_PRESET, {
        prompt: 'cancelled',
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ aborted: true });
    expect(mockFromModelName).not.toHaveBeenCalled();
    expect(mockInstance.setTokenCallback).not.toHaveBeenCalled();
    await tier2Generate(DEFAULT_PRESET, { prompt: 'next' });
  });

  it('releases ownership after native generation and loading failures', async () => {
    mockFromModelName.mockRejectedValueOnce(new Error('load failed'));
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'first' })).rejects.toThrow('load failed');
    mockInstance.generate.mockRejectedValueOnce(new Error('generate failed'));
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'second' })).rejects.toThrow(
      'generate failed',
    );
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'third' })).resolves.toMatchObject({
      text: 'hello from model',
    });
  });
});

describe('tier2: load reservations', () => {
  it('rejects generation while a public load is reserved even for a cached preset', async () => {
    await tier2LoadModel(DEFAULT_PRESET);
    const loading = deferred<ReturnType<typeof makeInstance>>();
    mockFromModelName.mockReturnValueOnce(loading.promise);
    const pending = tier2LoadModel(ALTERNATE_PRESET);
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'first' })).rejects.toThrow('busy');
    expect(mockInstance.setTokenCallback).not.toHaveBeenCalled();
    loading.resolve(makeInstance());
    await pending;
  });

  it('drains A/B/A reservations before accepting cached readiness', async () => {
    await tier2LoadModel(DEFAULT_PRESET);
    const loadingB = deferred<ReturnType<typeof makeInstance>>();
    mockFromModelName.mockReturnValueOnce(loadingB.promise);
    const pendingB = tier2LoadModel(ALTERNATE_PRESET);
    const pendingA = tier2LoadModel(DEFAULT_PRESET);
    await vi.waitFor(() => expect(mockFromModelName).toHaveBeenCalledTimes(2));
    loadingB.resolve(makeInstance());
    await Promise.all([pendingB, pendingA]);
    expect(mockFromModelName).toHaveBeenCalledTimes(3);
    expect(tier2LoadedPresetName()).toBe(DEFAULT_PRESET.modelName);
  });

  it('keeps later reservations busy when an earlier load settles', async () => {
    const loadingA = deferred<ReturnType<typeof makeInstance>>();
    const loadingB = deferred<ReturnType<typeof makeInstance>>();
    mockFromModelName.mockReturnValueOnce(loadingA.promise).mockReturnValueOnce(loadingB.promise);
    const first = tier2LoadModel(DEFAULT_PRESET);
    const second = tier2LoadModel(ALTERNATE_PRESET);
    const third = tier2LoadModel(DEFAULT_PRESET);
    loadingA.resolve(mockInstance);
    await first;
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'first' })).rejects.toThrow('busy');
    loadingB.resolve(makeInstance());
    await Promise.all([second, third]);
    expect(tier2LoadedPresetName()).toBe(DEFAULT_PRESET.modelName);
    expect(mockFromModelName).toHaveBeenCalledTimes(3);
  });

  it('invalidates loads waiting for download consent before native work begins', async () => {
    const consent = deferred<void>();
    const ensureDownloadAllowed = vi.fn(() => consent.promise);
    const pending = tier2LoadModel(DEFAULT_PRESET, undefined, { ensureDownloadAllowed });
    await vi.waitFor(() => expect(ensureDownloadAllowed).toHaveBeenCalledOnce());
    tier2Release();
    consent.resolve(undefined);
    await pending;
    expect(mockFromModelName).not.toHaveBeenCalled();
    expect(tier2LoadedPresetName()).toBeNull();
    await tier2LoadModel(DEFAULT_PRESET);
    expect(mockFromModelName).toHaveBeenCalledOnce();
  });

  it('disposes an invalidated late instance without clearing a newer reservation', async () => {
    const oldLoading = deferred<ReturnType<typeof makeInstance>>();
    const newLoading = deferred<ReturnType<typeof makeInstance>>();
    const lateInstance = makeInstance();
    mockFromModelName
      .mockReturnValueOnce(oldLoading.promise)
      .mockReturnValueOnce(newLoading.promise);
    const oldLoad = tier2LoadModel(DEFAULT_PRESET);
    await vi.waitFor(() => expect(mockFromModelName).toHaveBeenCalledOnce());
    tier2Release();
    const newLoad = tier2LoadModel(ALTERNATE_PRESET);
    oldLoading.resolve(lateInstance);
    await oldLoad;
    expect(lateInstance.delete).toHaveBeenCalledOnce();
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'first' })).rejects.toThrow('busy');
    newLoading.resolve(mockInstance);
    await newLoad;
    expect(tier2LoadedPresetName()).toBe(ALTERNATE_PRESET.modelName);
  });

  it('allows a later public reservation to proceed after a failed load', async () => {
    mockFromModelName.mockRejectedValueOnce(new Error('load failed'));
    const first = tier2LoadModel(DEFAULT_PRESET);
    const second = tier2LoadModel(ALTERNATE_PRESET);
    await expect(first).rejects.toThrow('load failed');
    await second;
    expect(tier2LoadedPresetName()).toBe(ALTERNATE_PRESET.modelName);
  });
});

describe('tier2: generation never downloads', () => {
  it('refuses with a readable error when the preset files are gone', async () => {
    _setPresetDownloadedCheckForTesting(async () => false);
    const failure = tier2Generate(DEFAULT_PRESET, { prompt: 'Hello' });
    await expect(failure).rejects.toBeInstanceOf(Tier2ModelNotDownloadedError);
    await expect(failure).rejects.toThrow(
      `${getDefaultModel().displayName} needs to be downloaded again. Open Models to download it.`,
    );
    expect(mockFromModelName).not.toHaveBeenCalled();
  });

  it('checks the files of the preset being generated, not another one', async () => {
    const isPresetDownloaded = vi.fn(
      async (preset: ExecutorchPreset) => preset.modelName === DEFAULT_PRESET.modelName,
    );
    _setPresetDownloadedCheckForTesting(isPresetDownloaded);
    await expect(tier2Generate(ALTERNATE_PRESET, { prompt: 'Hello' })).rejects.toBeInstanceOf(
      Tier2ModelNotDownloadedError,
    );
    expect(isPresetDownloaded).toHaveBeenCalledWith(ALTERNATE_PRESET);
  });

  it('fails closed when the files cannot be listed', async () => {
    _setPresetDownloadedCheckForTesting(null);
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'Hello' })).rejects.toBeInstanceOf(
      Tier2ModelNotDownloadedError,
    );
    expect(mockFromModelName).not.toHaveBeenCalled();
  });

  it('does not re-check files for a model that is already loaded', async () => {
    await tier2LoadModel(DEFAULT_PRESET);
    const isPresetDownloaded = vi.fn(async () => false);
    _setPresetDownloadedCheckForTesting(isPresetDownloaded);
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'Hello' })).resolves.toMatchObject({
      runtime: 'executorch',
    });
    expect(isPresetDownloaded).not.toHaveBeenCalled();
  });

  it('releases the generation lease after a refusal so the next send can run', async () => {
    _setPresetDownloadedCheckForTesting(async () => false);
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'first' })).rejects.toBeInstanceOf(
      Tier2ModelNotDownloadedError,
    );
    _setPresetDownloadedCheckForTesting(async () => true);
    await expect(tier2Generate(DEFAULT_PRESET, { prompt: 'second' })).resolves.toMatchObject({
      aborted: false,
    });
  });
});
