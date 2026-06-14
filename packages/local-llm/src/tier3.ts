import type { GenerateOptions, GenerateResult } from './types';
import { getModelById } from './catalog';

// Tier 3 adapter: llama.rn (universal fallback, iOS 15+ / Android 10+).
// Dynamic require for tree-shaking parity with tier2.

interface LlamaContext {
  completion: (
    params: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      stop: string[];
    },
    onToken?: (data: { token: string }) => void,
  ) => Promise<{ text?: string; content?: string }>;
  stopCompletion?: () => Promise<void>;
  release: () => Promise<void>;
}

type InitLlamaFn = (opts: {
  model: string;
  n_ctx?: number;
  n_threads?: number;
}) => Promise<LlamaContext>;

async function getLlamaRnModule(): Promise<InitLlamaFn | null> {
  if (_llamaModuleOverride) return _llamaModuleOverride;
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
let _loadedContextTokens: number | null = null;
let _llamaModuleOverride: InitLlamaFn | null = null;
let _loadPromise: Promise<void> | null = null;

const DEFAULT_CONTEXT_TOKENS = 4096;
const MAX_MOBILE_CONTEXT_TOKENS = 8192;

const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
];

/** Inject a mock llama.rn module in tests — only call from test files. */
export function _setLlamaModuleForTesting(initLlama: InitLlamaFn | null): void {
  _llamaModuleOverride = initLlama;
}

function resolveContextTokens(modelId: string | undefined): number {
  const catalogContext = modelId ? getModelById(modelId)?.contextWindow : undefined;
  if (!catalogContext || !Number.isFinite(catalogContext)) return DEFAULT_CONTEXT_TOKENS;
  return Math.max(DEFAULT_CONTEXT_TOKENS, Math.min(catalogContext, MAX_MOBILE_CONTEXT_TOKENS));
}

export async function tier3LoadModel(modelPath: string, modelId?: string): Promise<void> {
  const contextTokens = resolveContextTokens(modelId);
  if (_loadedModelPath === modelPath && _loadedContextTokens === contextTokens && _llamaContext) {
    return;
  }
  if (_loadPromise) {
    await _loadPromise;
    if (_loadedModelPath === modelPath && _loadedContextTokens === contextTokens && _llamaContext) {
      return;
    }
  }
  const initLlama = await getLlamaRnModule();
  if (!initLlama) throw new Error('llama.rn not installed');
  _loadPromise = (async () => {
    if (_llamaContext) {
      await _llamaContext.release();
      _llamaContext = null;
      _loadedModelPath = null;
    }
    _llamaContext = await initLlama({
      model: modelPath,
      n_ctx: contextTokens,
    });
    _loadedModelPath = modelPath;
    _loadedContextTokens = contextTokens;
  })();

  try {
    await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

function buildMessages(
  opts: GenerateOptions,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  for (const message of opts.messages ?? []) {
    messages.push({ role: message.role, content: message.content });
  }
  messages.push({ role: 'user', content: opts.prompt });
  return messages;
}

export async function tier3Generate(
  modelPath: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const contextTokens = resolveContextTokens(opts.modelId);
  if (_loadedModelPath !== modelPath || _loadedContextTokens !== contextTokens || !_llamaContext) {
    await tier3LoadModel(modelPath, opts.modelId);
  }

  if (!_llamaContext) throw new Error('llama.rn context not initialized');

  const context = _llamaContext;
  let aborted = false;
  const abortHandler = () => {
    aborted = true;
    void context.stopCompletion?.().catch((error) => {
      console.warn('[local-llm] Failed to stop llama.rn completion:', error);
    });
  };
  if (opts.signal?.aborted) {
    opts.onDone?.({ aborted: true, reason: 'cancel' });
    return { text: '', runtime: 'llama_rn', aborted: true };
  }
  opts.signal?.addEventListener('abort', abortHandler, { once: true });

  let result: { text?: string; content?: string };
  try {
    result = await context.completion(
      {
        messages: buildMessages(opts),
        stop: STOP_WORDS,
      },
      ({ token }) => {
        if (!aborted) opts.onToken?.(token);
      },
    );
  } finally {
    opts.signal?.removeEventListener('abort', abortHandler);
  }
  aborted = aborted || !!opts.signal?.aborted;
  opts.onDone?.({ aborted });
  return {
    text: aborted ? '' : (result.text ?? result.content ?? ''),
    runtime: 'llama_rn',
    aborted,
  };
}

export async function tier3Release(): Promise<void> {
  _loadPromise = null;
  if (_llamaContext) {
    await _llamaContext.release();
    _llamaContext = null;
    _loadedModelPath = null;
    _loadedContextTokens = null;
  }
}
