import type { ExecutorchPreset } from '@agiworkforce/types';
import { getLocalModelCatalog } from './catalog';
import type { GenerateOptions, GenerateResult } from './types';

// react-native-executorch 0.8.4 exports LLMModule (not ETLLMModule).
// LLMModule wraps LLMController and provides generate(), configure(), interrupt().
// Multimodal (VLM) presets load with `capabilities:['vision']` and take the
// image as `mediaPath` on a user message (the controller extracts it and calls
// the native `generateMultimodal`).
interface LLMModuleInstance {
  generate: (
    messages: Array<{ role: string; content: string; mediaPath?: string }>,
    tools?: object[],
  ) => Promise<string>;
  configure: (config: {
    chatConfig?: object;
    generationConfig?: object;
    toolsConfig?: {
      tools: object[];
      executeToolCallback: (call: {
        toolName: string;
        arguments: object;
      }) => Promise<string | null>;
      displayToolCalls?: boolean;
    };
  }) => void;
  setTokenCallback: (opts: { tokenCallback: (token: string) => void }) => void;
  interrupt: () => void;
  delete: () => void;
}

interface LLMModuleStatic {
  fromModelName: (
    namedSources: {
      modelName: string;
      modelSource: string;
      tokenizerSource: string;
      tokenizerConfigSource: string;
      capabilities?: readonly string[];
    },
    onDownloadProgress?: (progress: number) => void,
    tokenCallback?: (token: string) => void,
  ) => Promise<LLMModuleInstance>;
}

/**
 * Resolve catalog-owned runtime metadata for an ExecuTorch VLM preset.
 * Capability flags and model-card sampling settings live beside the preset's
 * artifact identity so a model replacement never requires a runtime edit.
 */
export function executorchVlmPresetInfo(
  modelName: string,
):
  | { capabilities: readonly string[]; generationConfig?: Readonly<Record<string, number>> }
  | undefined {
  const preset = getLocalModelCatalog()
    .map((model) => model.executorchPreset)
    .find((candidate) => candidate?.modelName === modelName);
  if (!preset?.capabilities?.includes('vision')) return undefined;
  return {
    capabilities: preset.capabilities,
    ...(preset.generationConfig ? { generationConfig: preset.generationConfig } : {}),
  };
}

let _llmModuleOverride: LLMModuleStatic | null = null;

/** Inject a mock LLMModule in tests — only call from test files. */
export function _setLLMModuleForTesting(mod: LLMModuleStatic | null): void {
  _llmModuleOverride = mod;
}

function getLLMModuleClass(): LLMModuleStatic | null {
  if (_llmModuleOverride !== null) return _llmModuleOverride;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-executorch') as { LLMModule?: LLMModuleStatic };
    return mod.LLMModule ?? null;
  } catch {
    return null;
  }
}

let _instance: LLMModuleInstance | null = null;
let _loadedPresetName: string | null = null;
let _loadedPresetVision = false;
let _loadPromise: Promise<void> | null = null;
let _loadGeneration = 0;

/**
 * True when the CURRENTLY LOADED tier-2 model was loaded with the vision
 * capability — the tier-2 analog of `tier3IsMultimodalReady`. False before any
 * load and for text-only presets, so image routing can never claim a vision
 * path that is not actually live.
 */
export function tier2IsVisionReady(): boolean {
  return _instance !== null && _loadedPresetVision;
}

export async function tier2LoadModel(
  preset: ExecutorchPreset,
  onDownloadProgress?: (progress: number) => void,
): Promise<void> {
  if (_loadedPresetName === preset.modelName && _instance) return;
  if (_loadPromise) {
    await _loadPromise;
    if (_loadedPresetName === preset.modelName && _instance) return;
  }

  const LLMModule = getLLMModuleClass();
  if (!LLMModule) throw new Error('react-native-executorch not available');

  const loadGeneration = ++_loadGeneration;
  _loadPromise = (async () => {
    if (_instance) {
      _instance.delete();
      _instance = null;
      _loadedPresetName = null;
      _loadedPresetVision = false;
    }

    // VLM presets load with their vision capability and the model card's
    // sampling settings; text-only presets are byte-for-byte unchanged.
    const vlmInfo = executorchVlmPresetInfo(preset.modelName);
    const nextInstance = await LLMModule.fromModelName(
      {
        modelName: preset.modelName,
        modelSource: preset.modelSource,
        tokenizerSource: preset.tokenizerSource,
        tokenizerConfigSource: preset.tokenizerConfigSource,
        ...(vlmInfo ? { capabilities: vlmInfo.capabilities } : {}),
      },
      onDownloadProgress,
    );
    if (loadGeneration !== _loadGeneration) {
      nextInstance.delete();
      return;
    }
    if (vlmInfo?.generationConfig) {
      nextInstance.configure({ generationConfig: vlmInfo.generationConfig });
    }
    _instance = nextInstance;
    _loadedPresetName = preset.modelName;
    _loadedPresetVision = vlmInfo?.capabilities.includes('vision') ?? false;
  })();

  try {
    await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

export async function tier2Generate(
  preset: ExecutorchPreset,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const LLMModule = getLLMModuleClass();
  if (!LLMModule) throw new Error('react-native-executorch not available');

  if (_loadedPresetName !== preset.modelName || !_instance) {
    await tier2LoadModel(preset);
  }
  const instance = _instance!;

  // Always update token callback for this call so streaming goes to the right handler.
  instance.setTokenCallback({ tokenCallback: opts.onToken ?? (() => undefined) });

  const abortHandler = () => {
    try {
      instance.interrupt();
    } catch (error) {
      console.warn('[local-llm] Failed to interrupt ExecuTorch generation:', error);
    }
  };
  if (opts.signal?.aborted) {
    abortHandler();
    opts.onDone?.({ aborted: true, reason: 'cancel' });
    return { text: '', runtime: 'executorch', aborted: true };
  }
  opts.signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    const messages: Array<{ role: string; content: string; mediaPath?: string }> = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    for (const m of opts.messages ?? []) {
      messages.push({ role: m.role, content: m.content });
    }

    // Attach the current turn's image only when the loaded model actually has
    // the vision capability (capability honesty — images are silently ignored
    // by text-only presets, matching the GenerateOptions contract). The
    // ExecuTorch controller accepts `file://` or absolute paths, NOT `data:`
    // URLs (unlike llama.rn), and takes one mediaPath per message.
    const mediaPath = _loadedPresetVision
      ? opts.images?.find((uri) => uri.startsWith('file://') || uri.startsWith('/'))
      : undefined;
    messages.push(
      mediaPath
        ? { role: 'user', content: opts.prompt, mediaPath }
        : { role: 'user', content: opts.prompt },
    );

    const text = await instance.generate(messages, opts.tools as object[] | undefined);
    const aborted = !!opts.signal?.aborted;
    opts.onDone?.(aborted ? { aborted: true, reason: 'cancel' } : { aborted: false });
    return { text: aborted ? '' : text, runtime: 'executorch', aborted };
  } finally {
    opts.signal?.removeEventListener('abort', abortHandler);
  }
}

export function tier2Release(): void {
  _loadGeneration += 1;
  _loadPromise = null;
  if (_instance) {
    _instance.delete();
    _instance = null;
    _loadedPresetName = null;
    _loadedPresetVision = false;
  }
}
