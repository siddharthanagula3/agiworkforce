import type { ExecutorchPreset } from '@agiworkforce/types';
import { getLocalModelCatalog } from './catalog';
import { reportProgressBySteps } from './progress';
import type { GenerateOptions, GenerateResult } from './types';

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

export function _setLLMModuleForTesting(mod: LLMModuleStatic | null): void {
  _llmModuleOverride = mod;
}

function getLLMModuleClass(): LLMModuleStatic | null {
  if (_llmModuleOverride !== null) return _llmModuleOverride;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-executorch/legacy') as { LLMModule?: LLMModuleStatic };
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
let _generationLease: symbol | null = null;

function generationBusyError(): Error {
  return new Error(
    'ExecuTorch is busy. Wait for the current generation to finish before trying again.',
  );
}

export function tier2LoadedPresetName(): string | null {
  return _instance ? _loadedPresetName : null;
}

export function tier2IsVisionReady(): boolean {
  return _instance !== null && _loadedPresetVision;
}

interface ExecutorchFilesModule {
  ResourceFetcher: { getAdapter: () => { listDownloadedFiles?: () => Promise<string[]> } };
  ResourceFetcherUtils: { getFilenameFromUri: (uri: string) => string };
}

let _presetCheckOverride: ((preset: ExecutorchPreset) => Promise<boolean>) | null = null;

export function _setPresetDownloadedCheckForTesting(
  check: ((preset: ExecutorchPreset) => Promise<boolean>) | null,
): void {
  _presetCheckOverride = check;
}

/**
 * True only when the model and both tokenizer files are on disk. A fetcher that
 * cannot list its files reads as not downloaded, which is safe: fetching again
 * skips every file already present.
 */
export async function tier2IsPresetDownloaded(preset: ExecutorchPreset): Promise<boolean> {
  if (_presetCheckOverride) return _presetCheckOverride(preset);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const library = require('react-native-executorch/legacy') as ExecutorchFilesModule;
    const listed = await library.ResourceFetcher.getAdapter().listDownloadedFiles?.();
    if (!listed) return false;
    const present = new Set(listed.map((uri) => uri.slice(uri.lastIndexOf('/') + 1)));
    return [preset.modelSource, preset.tokenizerSource, preset.tokenizerConfigSource].every(
      (source) => present.has(library.ResourceFetcherUtils.getFilenameFromUri(source)),
    );
  } catch {
    return false;
  }
}

export class Tier2ModelNotDownloadedError extends Error {
  readonly modelName: string;
  constructor(displayName: string, modelName: string) {
    super(`${displayName} needs to be downloaded again. Open Models to download it.`);
    this.name = 'Tier2ModelNotDownloadedError';
    this.modelName = modelName;
  }
}

function presetDisplayName(preset: ExecutorchPreset): string {
  const entry = getLocalModelCatalog().find(
    (model) => model.executorchPreset?.modelName === preset.modelName,
  );
  return entry?.displayName ?? preset.modelName;
}

/**
 * Loading a preset whose files are gone makes ExecuTorch re-download several
 * gigabytes with no network-consent or free-space check, so every load that is
 * not a deliberate install must prove the files exist first.
 */
export async function tier2AssertPresetDownloaded(preset: ExecutorchPreset): Promise<void> {
  if (_instance && _loadedPresetName === preset.modelName) return;
  if (!(await tier2IsPresetDownloaded(preset))) {
    throw new Tier2ModelNotDownloadedError(presetDisplayName(preset), preset.modelName);
  }
}

export interface Tier2LoadOptions {
  /**
   * Runs before ExecuTorch fetches any artifact. The host app supplies the same
   * network-consent and free-space gate the GGUF path uses; throwing here stops
   * the download before the first byte.
   */
  ensureDownloadAllowed?: () => Promise<void>;
}

async function loadModel(
  preset: ExecutorchPreset,
  loadGeneration: number,
  onDownloadProgress?: (progress: number) => void,
  options?: Tier2LoadOptions,
): Promise<void> {
  if (loadGeneration !== _loadGeneration) return;
  if (_loadedPresetName === preset.modelName && _instance) return;
  const LLMModule = getLLMModuleClass();
  if (!LLMModule) throw new Error('react-native-executorch not available');

  await options?.ensureDownloadAllowed?.();
  if (loadGeneration !== _loadGeneration) return;
  if (_instance) {
    _instance.delete();
    _instance = null;
    _loadedPresetName = null;
    _loadedPresetVision = false;
  }

  const vlmInfo = executorchVlmPresetInfo(preset.modelName);
  const nextInstance = await LLMModule.fromModelName(
    {
      modelName: preset.modelName,
      modelSource: preset.modelSource,
      tokenizerSource: preset.tokenizerSource,
      tokenizerConfigSource: preset.tokenizerConfigSource,
      ...(vlmInfo ? { capabilities: vlmInfo.capabilities } : {}),
    },
    onDownloadProgress ? reportProgressBySteps(onDownloadProgress) : undefined,
  );
  if (loadGeneration !== _loadGeneration) {
    nextInstance.delete();
    return;
  }
  try {
    if (vlmInfo?.generationConfig) {
      nextInstance.configure({ generationConfig: vlmInfo.generationConfig });
    }
  } catch (error) {
    nextInstance.delete();
    throw error;
  }
  _instance = nextInstance;
  _loadedPresetName = preset.modelName;
  _loadedPresetVision = vlmInfo?.capabilities.includes('vision') ?? false;
}

export async function tier2LoadModel(
  preset: ExecutorchPreset,
  onDownloadProgress?: (progress: number) => void,
  options?: Tier2LoadOptions,
): Promise<void> {
  if (_generationLease) throw generationBusyError();
  const loadGeneration = _loadGeneration;
  const previousLoad = _loadPromise;
  const pendingLoad = (async () => {
    // Every reservation drains the preceding queue before testing cached readiness (A/B/A).
    await previousLoad?.catch(() => undefined);
    await loadModel(preset, loadGeneration, onDownloadProgress, options);
  })();
  _loadPromise = pendingLoad;
  try {
    await pendingLoad;
  } finally {
    if (_loadPromise === pendingLoad) _loadPromise = null;
  }
}

export async function tier2Generate(
  preset: ExecutorchPreset,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  if (_generationLease || _loadPromise) throw generationBusyError();
  const lease = Symbol('executorch-generation');
  _generationLease = lease;
  let instance: LLMModuleInstance | null = null;
  const abortHandler = () => {
    try {
      instance?.interrupt();
    } catch (error) {
      console.warn('[local-llm] Failed to interrupt ExecuTorch generation:', error);
    }
  };

  try {
    if (opts.signal?.aborted) {
      opts.onDone?.({ aborted: true, reason: 'cancel' });
      return { text: '', runtime: 'executorch', aborted: true };
    }
    await tier2AssertPresetDownloaded(preset);
    await loadModel(preset, _loadGeneration);
    instance = _instance;
    if (!instance) throw new Error('ExecuTorch model is not loaded');

    if (opts.signal?.aborted) {
      opts.onDone?.({ aborted: true, reason: 'cancel' });
      return { text: '', runtime: 'executorch', aborted: true };
    }
    instance.setTokenCallback({
      tokenCallback: (token) => {
        if (_generationLease === lease && !opts.signal?.aborted) opts.onToken?.(token);
      },
    });
    opts.signal?.addEventListener('abort', abortHandler, { once: true });

    const messages: Array<{ role: string; content: string; mediaPath?: string }> = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    for (const m of opts.messages ?? []) {
      messages.push({ role: m.role, content: m.content });
    }

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
    if (_generationLease === lease) _generationLease = null;
  }
}

export function tier2Release(): void {
  if (_generationLease) throw generationBusyError();
  _loadGeneration += 1;
  if (_instance) {
    _instance.delete();
    _instance = null;
    _loadedPresetName = null;
    _loadedPresetVision = false;
  }
}
