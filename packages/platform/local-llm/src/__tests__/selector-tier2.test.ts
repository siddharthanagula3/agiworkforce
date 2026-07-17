/**
 * selector → tier2 dispatch: catalog model wiring test.
 *
 * Validates that the default catalog model (qwen3-4b-instruct-2507) has an
 * executorchPreset, and that tier2Generate produces a real streamed response
 * when LLMModule is injected via _setLLMModuleForTesting.
 *
 * NOTE: localGenerate() is NOT imported here because selector.ts transitively
 * imports capabilities.ts → react-native (Flow source), which rolldown cannot
 * parse in a Vitest/Node environment. The selector logic is covered by:
 *   - This test: catalog has preset → tier2Generate produces tokens
 *   - apps/mobile/__tests__/onboarding-tier2.test.tsx: full onboarding flow
 *     (Jest + Metro, which handles Flow/react-native correctly)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDefaultModel, getLiteModeModel } from '../catalog.js';
import { tier2Generate, tier2LoadModel, tier2Release, _setLLMModuleForTesting } from '../tier2.js';

// ---------------------------------------------------------------------------
// Inject mock LLMModule via the test seam
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('catalog model has executorchPreset (prerequisite for tier2 dispatch)', () => {
  it('qwen3-4b-instruct-2507 has a valid executorchPreset', () => {
    const model = getDefaultModel();
    expect(model.executorchPreset).toBeDefined();
    expect(model.executorchPreset?.modelName).toBe('qwen3-4b-quantized');
    expect(model.executorchPreset?.modelSource).toContain('huggingface.co');
    expect(model.executorchPreset?.tokenizerSource).toContain('huggingface.co');
    expect(model.executorchPreset?.tokenizerConfigSource).toContain('huggingface.co');
  });

  it('llama-3.2-1b-instruct-spinquant has a valid executorchPreset', () => {
    const model = getLiteModeModel();
    expect(model).toBeDefined();
    expect(model!.executorchPreset).toBeDefined();
    expect(model!.executorchPreset?.modelName).toBe('llama-3.2-1b-spinquant');
  });
});

describe('tier2Generate with mocked LLMModule produces a real offline response', () => {
  it('returns streamed tokens and full text for the qwen3 preset', async () => {
    const model = getDefaultModel();
    const preset = model.executorchPreset!;
    const receivedTokens: string[] = [];

    const result = await tier2Generate(preset, {
      prompt: 'What color is the sky?',
      onToken: (tok) => receivedTokens.push(tok),
    });

    // LLMModule.fromModelName was called with the correct preset fields
    expect(mockFromModelName).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: 'qwen3-4b-quantized',
        modelSource: expect.stringContaining('qwen3_4b_8da4w.pte'),
      }),
      undefined,
    );

    // generate was called with at least the user message
    expect(mockInstance.generate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      undefined,
    );

    // Tokens streamed in order
    expect(receivedTokens).toEqual(STREAMED_TOKENS);

    // Result is a real offline response (not the "download a model first" error)
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
