
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDefaultModel, getLiteModeModel } from '../catalog.js';
import { tier2Generate, tier2LoadModel, tier2Release, _setLLMModuleForTesting } from '../tier2.js';

const STREAMED_TOKENS = ['The', ' sky', ' is', ' blue', '.'];

function makeInstance(responseText = STREAMED_TOKENS.join('')) {
  let _tokenCb: ((token: string) => void) | null = null;
  return {
    generate: vi.fn().mockImplementation(async () => {
      if (_tokenCb) {
        for (const tok of STREAMED_TOKENS) {
          _tokenCb(tok);
        }
      }
      return responseText;
    }),
    setTokenCallback: vi.fn().mockImplementation(({ tokenCallback }) => {
      _tokenCb = tokenCallback;
    }),
    configure: vi.fn(),
    interrupt: vi.fn(),
    delete: vi.fn(),
  };
}

let mockInstance = makeInstance();
const mockFromModelName = vi.fn().mockImplementation(() => Promise.resolve(mockInstance));
const mockLLMModule = { fromModelName: mockFromModelName };

beforeEach(() => {
  vi.clearAllMocks();
  mockInstance = makeInstance();
  mockFromModelName.mockImplementation(() => Promise.resolve(mockInstance));
  _setLLMModuleForTesting(mockLLMModule);
  tier2Release();
});

describe('catalog model has executorchPreset (prerequisite for tier2 dispatch)', () => {
  it('the default model has a valid executorchPreset', () => {
    const model = getDefaultModel();
    const preset = model.executorchPreset!;
    expect(model.executorchPreset).toBeDefined();
    expect(preset.modelName).toBeTruthy();
    expect(model.executorchPreset?.modelSource).toContain('huggingface.co');
    expect(model.executorchPreset?.tokenizerSource).toContain('huggingface.co');
    expect(model.executorchPreset?.tokenizerConfigSource).toContain('huggingface.co');
  });

  it('the lite-mode model has a valid executorchPreset', () => {
    const model = getLiteModeModel();
    expect(model).toBeDefined();
    expect(model!.executorchPreset).toBeDefined();
    expect(model!.executorchPreset?.modelName).toBeTruthy();
    expect(model!.executorchPreset?.modelName).not.toBe(
      getDefaultModel().executorchPreset?.modelName,
    );
  });
});

describe('tier2Generate with mocked LLMModule produces a real offline response', () => {
  it('returns streamed tokens and full text for the catalog default preset', async () => {
    const model = getDefaultModel();
    const preset = model.executorchPreset!;
    const receivedTokens: string[] = [];

    const result = await tier2Generate(preset, {
      prompt: 'What color is the sky?',
      onToken: (tok) => receivedTokens.push(tok),
    });

    expect(mockFromModelName).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: preset.modelName,
        modelSource: preset.modelSource,
      }),
      undefined,
    );

    expect(mockInstance.generate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      undefined,
    );

    expect(receivedTokens).toEqual(STREAMED_TOKENS);

    expect(result.text).toBe(STREAMED_TOKENS.join(''));
    expect(result.runtime).toBe('executorch');
    expect(result.aborted).toBe(false);
  });

  it('passes system prompt, history, and user prompt in correct order', async () => {
    const preset = getDefaultModel().executorchPreset!;
    await tier2Generate(preset, {
      prompt: 'Follow up',
      systemPrompt: 'You are a helpful assistant.',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    });

    const messages: Array<{ role: string; content: string }> =
      mockInstance.generate.mock.calls[0][0];
    expect(messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
    expect(messages[3]).toEqual({ role: 'user', content: 'Follow up' });
  });

  it('tier2LoadModel passes the progress callback to fromModelName', async () => {
    const preset = getDefaultModel().executorchPreset!;
    const progressCb = vi.fn();
    await tier2LoadModel(preset, progressCb);
    expect(mockFromModelName).toHaveBeenCalledWith(expect.any(Object), progressCb);
  });
});
