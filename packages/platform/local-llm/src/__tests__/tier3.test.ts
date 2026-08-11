import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _setLlamaModuleForTesting,
  tier3Generate,
  tier3IsMultimodalReady,
  tier3Release,
} from '../tier3.js';
import type { LlamaMessage } from '../multimodal.js';
import { getDefaultModel } from '../catalog.js';
import { requireGgufVisionModel } from './catalog-fixtures.js';

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

    await tier3Generate('/models/text.gguf', {
      prompt: 'Use a larger context',
      modelId: getDefaultModel().id,
    });

    expect(initLlama).toHaveBeenCalledWith(
      expect.objectContaining({
        model: '/models/text.gguf',
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

describe('tier3 llama.rn multimodal (vision) path', () => {
  afterEach(async () => {
    await tier3Release();
    _setLlamaModuleForTesting(null);
  });

  it('loads with ctx_shift:false, attaches the mmproj, and sends an image content array', async () => {
    const initMultimodal = vi.fn(async () => true);
    const completion = vi.fn(async (_p: { messages: LlamaMessage[]; stop: string[] }) => ({
      text: 'A cat on a mat.',
    }));
    const initLlama = vi.fn(async () => ({ completion, initMultimodal, release: vi.fn() }));
    _setLlamaModuleForTesting(initLlama);

    const result = await tier3Generate('/models/vision.gguf', {
      modelId: requireGgufVisionModel().id,
      prompt: 'What is in this photo?',
      images: ['file:///tmp/photo.jpg'],
      mmprojPath: '/models/vision.mmproj.gguf',
    });

    // ctx_shift disabled for multimodal so media token positions stay valid.
    expect(initLlama).toHaveBeenCalledWith(
      expect.objectContaining({ model: '/models/vision.gguf', ctx_shift: false }),
    );
    // mmproj projector attached via initMultimodal.
    expect(initMultimodal).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/models/vision.mmproj.gguf' }),
    );
    expect(tier3IsMultimodalReady()).toBe(true);

    // The current user turn carries a text+image_url content array.
    const sentMessages = completion.mock.calls[0]![0].messages;
    expect(sentMessages[sentMessages.length - 1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this photo?' },
        { type: 'image_url', image_url: { url: 'file:///tmp/photo.jpg' } },
      ],
    });
    expect(result.text).toBe('A cat on a mat.');
  });

  it('does not send image parts when the mmproj fails to attach (initMultimodal false)', async () => {
    const initMultimodal = vi.fn(async () => false);
    const completion = vi.fn(async (_p: { messages: LlamaMessage[]; stop: string[] }) => ({
      text: 'text only',
    }));
    _setLlamaModuleForTesting(
      vi.fn(async () => ({ completion, initMultimodal, release: vi.fn() })),
    );

    await tier3Generate('/models/vision.gguf', {
      modelId: requireGgufVisionModel().id,
      prompt: 'Describe this',
      images: ['file:///tmp/photo.jpg'],
      mmprojPath: '/models/vision.mmproj.gguf',
    });

    expect(tier3IsMultimodalReady()).toBe(false);
    // Vision unavailable -> user content is a plain string, never a broken image array.
    const sentMessages = completion.mock.calls[0]![0].messages;
    expect(sentMessages[sentMessages.length - 1]).toEqual({
      role: 'user',
      content: 'Describe this',
    });
  });
});
