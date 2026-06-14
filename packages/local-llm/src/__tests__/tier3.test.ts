import { afterEach, describe, expect, it, vi } from 'vitest';
import { _setLlamaModuleForTesting, tier3Generate, tier3Release } from '../tier3.js';

describe('tier3 llama.rn adapter', () => {
  afterEach(async () => {
    await tier3Release();
    _setLlamaModuleForTesting(null);
  });

  it('derives llama.rn context size from catalog metadata with a mobile-safe cap', async () => {
    const initLlama = vi.fn(async () => ({
      completion: vi.fn(async () => ({ text: 'ok' })),
      release: vi.fn(async () => undefined),
    }));
    _setLlamaModuleForTesting(initLlama);

    await tier3Generate('/models/qwen3.gguf', {
      prompt: 'Use a larger context',
      modelId: 'qwen3-4b-instruct-2507',
    });

    expect(initLlama).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '/models/qwen3.gguf',
        n_ctx: 8192,
      }),
    );
  });

  it('uses llama.rn chat messages and stop words instead of a hardcoded prompt template', async () => {
    const completion = vi.fn(async (_params, onToken?: (data: { token: string }) => void) => {
      onToken?.({ token: 'Hello' });
      return { text: 'Hello world' };
    });

    _setLlamaModuleForTesting(
      vi.fn(async () => ({
        completion,
        release: vi.fn(async () => undefined),
      })),
    );

    const onToken = vi.fn();
    const result = await tier3Generate('/models/local.gguf', {
      prompt: 'Now answer',
      systemPrompt: 'You are local.',
      messages: [
        { role: 'user', content: 'Earlier question' },
        { role: 'assistant', content: 'Earlier answer' },
      ],
      onToken,
    });

    expect(completion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are local.' },
          { role: 'user', content: 'Earlier question' },
          { role: 'assistant', content: 'Earlier answer' },
          { role: 'user', content: 'Now answer' },
        ],
        stop: expect.arrayContaining(['</s>', '<|im_end|>', '<|eot_id|>']),
      }),
      expect.any(Function),
    );
    expect(onToken).toHaveBeenCalledWith('Hello');
    expect(result).toEqual({ text: 'Hello world', runtime: 'llama_rn', aborted: false });
  });

  it('stops an in-flight llama.rn completion when the caller aborts', async () => {
    const stopCompletion = vi.fn(async () => undefined);
    let resolveCompletion: (value: { text: string }) => void = () => undefined;
    const completion = vi.fn(
      () =>
        new Promise<{ text: string }>((resolve) => {
          resolveCompletion = resolve;
        }),
    );

    _setLlamaModuleForTesting(
      vi.fn(async () => ({
        completion,
        stopCompletion,
        release: vi.fn(async () => undefined),
      })),
    );

    const controller = new AbortController();
    const pending = tier3Generate('/models/local.gguf', {
      prompt: 'Write a long answer',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(completion).toHaveBeenCalledOnce());
    controller.abort();
    resolveCompletion({ text: 'late text' });

    const result = await pending;
    expect(stopCompletion).toHaveBeenCalledOnce();
    expect(result).toEqual({ text: '', runtime: 'llama_rn', aborted: true });
  });
});
