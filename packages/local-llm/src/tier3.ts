import type { GenerateOptions, GenerateResult } from './types.js';

// Tier 3 adapter: llama.rn (universal fallback, iOS 15+ / Android 10+).
// Dynamic require for tree-shaking parity with tier2.

interface LlamaContext {
  completion: (
    prompt: string,
    opts: { onToken: (data: { token: string }) => void },
  ) => Promise<{ text: string }>;
  release: () => Promise<void>;
}

type InitLlamaFn = (opts: {
  model: string;
  n_ctx?: number;
  n_threads?: number;
}) => Promise<LlamaContext>;

async function getLlamaRnModule(): Promise<InitLlamaFn | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('llama.rn') as { initLlama?: InitLlamaFn };
    return mod.initLlama ?? null;
  } catch {
    return null;
  }
}

let _llamaContext: LlamaContext | null = null;
let _loadedModelPath: string | null = null;

export async function tier3LoadModel(modelPath: string): Promise<void> {
  if (_loadedModelPath === modelPath && _llamaContext) return;
  const initLlama = await getLlamaRnModule();
  if (!initLlama) throw new Error('llama.rn not installed');
  if (_llamaContext) {
    await _llamaContext.release();
    _llamaContext = null;
  }
  _llamaContext = await initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_threads: 2,
  });
  _loadedModelPath = modelPath;
}

export async function tier3Generate(
  modelPath: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  if (_loadedModelPath !== modelPath || !_llamaContext) {
    await tier3LoadModel(modelPath);
  }

  if (!_llamaContext) throw new Error('llama.rn context not initialized');

  const systemBlock = opts.systemPrompt ? `<|system|>\n${opts.systemPrompt}\n` : '';
  const historyBlock = (opts.messages ?? [])
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'user' ? `<|user|>\n${m.content}\n` : `<|assistant|>\n${m.content}\n`))
    .join('');
  const fullPrompt = `${systemBlock}${historyBlock}<|user|>\n${opts.prompt}\n<|assistant|>\n`;

  const aborted = false;
  const result = await _llamaContext.completion(fullPrompt, {
    onToken: ({ token }) => {
      if (!aborted) opts.onToken?.(token);
    },
  });
  opts.onDone?.({ aborted });
  return { text: result.text, runtime: 'llama_rn', aborted };
}

export async function tier3Release(): Promise<void> {
  if (_llamaContext) {
    await _llamaContext.release();
    _llamaContext = null;
    _loadedModelPath = null;
  }
}
