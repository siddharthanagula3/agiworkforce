import type { GenerateOptions, GenerateResult } from './types.js';

interface ETLLMModule {
  loadModel: (path: string) => Promise<void>;
  runInference: (
    prompt: string,
    onToken: (t: string) => void,
    onDone: () => void,
  ) => Promise<string>;
}

async function getExecutorchModule(): Promise<ETLLMModule | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-executorch') as { ETLLMModule?: ETLLMModule };
    return mod.ETLLMModule ?? null;
  } catch {
    return null;
  }
}

let _loadedModelPath: string | null = null;

export async function tier2LoadModel(modelPath: string): Promise<void> {
  if (_loadedModelPath === modelPath) return;
  const mod = await getExecutorchModule();
  if (!mod) throw new Error('react-native-executorch not installed');
  await mod.loadModel(modelPath);
  _loadedModelPath = modelPath;
}

export async function tier2Generate(
  modelPath: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const mod = await getExecutorchModule();
  if (!mod) throw new Error('react-native-executorch not installed');

  if (_loadedModelPath !== modelPath) {
    await tier2LoadModel(modelPath);
  }

  const systemBlock = opts.systemPrompt ? `System: ${opts.systemPrompt}\n` : '';
  const historyBlock = (opts.messages ?? [])
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');
  const fullPrompt = `${systemBlock}${historyBlock}\nUser: ${opts.prompt}\nAssistant:`;

  const aborted = false;
  const text = await mod.runInference(
    fullPrompt,
    (token) => {
      if (!aborted) opts.onToken?.(token);
    },
    () => {
      opts.onDone?.({ aborted });
    },
  );
  return { text, runtime: 'executorch', aborted };
}
