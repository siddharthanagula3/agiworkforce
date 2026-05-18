import type { ExecutorchPreset } from '@agiworkforce/types';
import type { GenerateOptions, GenerateResult } from './types.js';

// react-native-executorch 0.8.4 exports LLMModule (not ETLLMModule).
// LLMModule wraps LLMController and provides generate(), configure(), interrupt().
interface LLMModuleInstance {
  generate: (
    messages: Array<{ role: string; content: string }>,
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
    },
    onDownloadProgress?: (progress: number) => void,
    tokenCallback?: (token: string) => void,
  ) => Promise<LLMModuleInstance>;
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

export async function tier2LoadModel(
  preset: ExecutorchPreset,
  onDownloadProgress?: (progress: number) => void,
): Promise<void> {
  if (_loadedPresetName === preset.modelName && _instance) return;

  const LLMModule = getLLMModuleClass();
  if (!LLMModule) throw new Error('react-native-executorch not available');

  if (_instance) {
    _instance.delete();
    _instance = null;
    _loadedPresetName = null;
  }

  _instance = await LLMModule.fromModelName(
    {
      modelName: preset.modelName,
      modelSource: preset.modelSource,
      tokenizerSource: preset.tokenizerSource,
      tokenizerConfigSource: preset.tokenizerConfigSource,
    },
    onDownloadProgress,
  );
  _loadedPresetName = preset.modelName;
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
  if (opts.onToken) {
    instance.setTokenCallback({ tokenCallback: opts.onToken });
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }
  for (const m of opts.messages ?? []) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: opts.prompt });

  const text = await instance.generate(messages, opts.tools as object[] | undefined);
  opts.onDone?.({ aborted: false });
  return { text, runtime: 'executorch', aborted: false };
}

export function tier2Release(): void {
  if (_instance) {
    _instance.delete();
    _instance = null;
    _loadedPresetName = null;
  }
}
