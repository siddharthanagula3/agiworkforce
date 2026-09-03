import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutorchPreset } from '@agiworkforce/types';
import { getDefaultModel, getLiteModeModel } from '../catalog.js';
import { tier2Generate, tier2LoadModel, tier2Release, _setLLMModuleForTesting } from '../tier2.js';

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
    expect(mockFromModelName).toHaveBeenCalledOnce();

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

  it('calls setTokenCallback when onToken provided', async () => {
    const onToken = vi.fn();
    await tier2Generate(DEFAULT_PRESET, { prompt: 'Hi', onToken });
    expect(mockInstance.setTokenCallback).toHaveBeenCalledWith({ tokenCallback: onToken });
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
    controller.abort();
    resolveGenerate('late text');

    const result = await pending;
    expect(mockInstance.interrupt).toHaveBeenCalledOnce();
    expect(result).toEqual({ text: '', runtime: 'executorch', aborted: true });
  });
});
