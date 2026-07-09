import type { GenerateOptions, GenerateResult } from './types';
import { getModelById } from './catalog';
import { buildMultimodalMessages, type LlamaMessage } from './multimodal';

// Tier 3 adapter: llama.rn (universal fallback, iOS 15+ / Android 10+).
// Supports text-only GGUF models and multimodal (vision) GGUF models. A vision
// model is loaded with `ctx_shift:false` and then attaches its mmproj projector
// via `context.initMultimodal({ path })`; image input is only effective once
// that returns true. Dynamic require for tree-shaking parity with tier2.

interface LlamaContext {
  completion: (
    params: {
      messages: LlamaMessage[];
      stop: string[];
    },
    onToken?: (data: { token: string }) => void,
  ) => Promise<{ text?: string; content?: string }>;
  /**
   * Attach an mmproj vision projector. Returns true on success. llama.rn:
   * `await context.initMultimodal({ path, use_gpu })`.
   */
  initMultimodal?: (params: { path: string; use_gpu?: boolean }) => Promise<boolean>;
  stopCompletion?: () => Promise<void>;
  release: () => Promise<void>;
}

type InitLlamaFn = (opts: {
  model: string;
  n_ctx?: number;
  n_threads?: number;
  n_gpu_layers?: number;
  /** MUST be false for multimodal models to keep media token positions valid. */
  ctx_shift?: boolean;
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
let _loadedMmprojPath: string | null = null;
let _multimodalReady = false;
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

/** True when a model is loaded with a working mmproj projector (vision ready). */
export function tier3IsMultimodalReady(): boolean {
  return Boolean(_llamaContext) && _multimodalReady;
}

function resolveContextTokens(modelId: string | undefined): number {
  const catalogContext = modelId ? getModelById(modelId)?.contextWindow : undefined;
  if (!catalogContext || !Number.isFinite(catalogContext)) return DEFAULT_CONTEXT_TOKENS;
  return Math.max(DEFAULT_CONTEXT_TOKENS, Math.min(catalogContext, MAX_MOBILE_CONTEXT_TOKENS));
}

function isLoaded(modelPath: string, contextTokens: number, mmprojPath: string | null): boolean {
  return (
    _loadedModelPath === modelPath &&
    _loadedContextTokens === contextTokens &&
    _loadedMmprojPath === (mmprojPath ?? null) &&
    !!_llamaContext
  );
}

async function loadContext(
  modelPath: string,
  contextTokens: number,
  mmprojPath: string | null,
): Promise<void> {
  const initLlama = await getLlamaRnModule();
  if (!initLlama) throw new Error('llama.rn not installed');

  _loadPromise = (async () => {
    if (_llamaContext) {
      await _llamaContext.release();
      _llamaContext = null;
      _loadedModelPath = null;
      _loadedMmprojPath = null;
      _multimodalReady = false;
    }

    const context = await initLlama({
      model: modelPath,
      n_ctx: contextTokens,
      // Multimodal models require ctx_shift:false so media token positions stay
      // valid; we only set it (and enable GPU layers) when an mmproj is
      // requested, leaving llama.rn's defaults for the text-only path.
      ...(mmprojPath ? { ctx_shift: false, n_gpu_layers: 99 } : {}),
    });

    let multimodalReady = false;
    if (mmprojPath) {
      if (typeof context.initMultimodal !== 'function') {
        console.warn(
          '[local-llm] llama.rn build lacks initMultimodal — vision disabled, text still works.',
        );
      } else {
        try {
          multimodalReady =
            (await context.initMultimodal({ path: mmprojPath, use_gpu: true })) === true;
          if (!multimodalReady) {
            console.warn(
              '[local-llm] initMultimodal returned false — mmproj not loaded, vision off.',
            );
          }
        } catch (error) {
          console.warn('[local-llm] initMultimodal threw — vision off:', error);
          multimodalReady = false;
        }
      }
    }

    _llamaContext = context;
    _loadedModelPath = modelPath;
    _loadedContextTokens = contextTokens;
    _loadedMmprojPath = mmprojPath ?? null;
    _multimodalReady = multimodalReady;
  })();

  try {
    await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

export async function tier3LoadModel(modelPath: string, modelId?: string): Promise<void> {
  const contextTokens = resolveContextTokens(modelId);
  if (isLoaded(modelPath, contextTokens, null)) return;
  if (_loadPromise) {
    await _loadPromise;
    if (isLoaded(modelPath, contextTokens, null)) return;
  }
  await loadContext(modelPath, contextTokens, null);
}

/**
 * Load a multimodal GGUF model plus its mmproj vision projector. After this
 * resolves, check `tier3IsMultimodalReady()` — if false, the mmproj failed to
 * attach and only text generation is available.
 */
export async function tier3LoadMultimodalModel(
  modelPath: string,
  mmprojPath: string,
  modelId?: string,
): Promise<void> {
  const contextTokens = resolveContextTokens(modelId);
  if (isLoaded(modelPath, contextTokens, mmprojPath)) return;
  if (_loadPromise) {
    await _loadPromise;
    if (isLoaded(modelPath, contextTokens, mmprojPath)) return;
  }
  await loadContext(modelPath, contextTokens, mmprojPath);
}

function buildMessages(opts: GenerateOptions): LlamaMessage[] {
  return buildMultimodalMessages({
    systemPrompt: opts.systemPrompt,
    messages: opts.messages,
    prompt: opts.prompt,
    // Only pass images through once the projector is actually loaded, so we
    // never hand image parts to a model that cannot consume them.
    images: _multimodalReady ? opts.images : undefined,
  });
}

export async function tier3Generate(
  modelPath: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const contextTokens = resolveContextTokens(opts.modelId);
  const wantMmproj = opts.mmprojPath ?? null;
  if (!isLoaded(modelPath, contextTokens, wantMmproj)) {
    if (wantMmproj) {
      await tier3LoadMultimodalModel(modelPath, wantMmproj, opts.modelId);
    } else {
      await tier3LoadModel(modelPath, opts.modelId);
    }
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
    _loadedMmprojPath = null;
    _multimodalReady = false;
  }
}
