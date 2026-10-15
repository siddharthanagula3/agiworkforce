import { OLLAMA_TIMEOUT_MS } from '../constants/timeouts';
import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';

export interface OllamaModelDetails {
  parameter_size: string;
  quantization_level: string;
  family: string;
  families: string[];
  parent_model: string;
  format: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  details: OllamaModelDetails;
}

async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = OLLAMA_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Ollama command '${command}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke<T>(command, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function formatModelSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Check if Ollama server is running and accessible.
 *
 * @returns true if Ollama is running and responding, false otherwise
 *
 * @example
 * ```ts
 * const isRunning = await ollamaCheckStatus();
 * if (!isRunning) {
 *   console.log('Start Ollama with: ollama serve');
 * }
 * ```
 */
export async function ollamaCheckStatus(
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<boolean> {
  try {
    return await invokeWithTimeout<boolean>('ollama_check_status', {
      baseUrl,
      allowPrivateNetwork,
    });
  } catch (error) {
    console.debug('[Ollama] Status check failed:', error);
    return false;
  }
}

/**
 * Fetch the list of installed Ollama models.
 *
 * @returns Array of installed models with metadata
 * @throws Error if Ollama is not running or the request fails
 *
 * @example
 * ```ts
 * const models = await ollamaListModels();
 * models.forEach(model => {
 *   console.log(`${model.name} (${formatModelSize(model.size)})`);
 * });
 * ```
 */
export async function ollamaListModels(
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<OllamaModel[]> {
  try {
    return await invokeWithTimeout<OllamaModel[]>('ollama_list_models', {
      baseUrl,
      allowPrivateNetwork,
    });
  } catch (error) {
    throw new Error(`Failed to list Ollama models: ${error}`);
  }
}

export interface OllamaPullProgress {
  model: string;
  status: string;
  digest: string | null;
  total: number | null;
  completed: number | null;
}

export type OllamaPullOutcome = 'completed' | 'cancelled';

export interface OllamaLoadedModel {
  name: string;
  size: number;
  size_vram: number;
  expires_at: string | null;
  parameter_size: string;
  quantization_level: string;
}

/**
 * Download a model through Ollama. Progress arrives on
 * `ollama:pull-progress`; the promise settles when Ollama reports
 * success, when `ollamaCancelPull` stops it, or when the download fails.
 */
export async function ollamaPullModel(
  modelName: string,
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<OllamaPullOutcome> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    const outcome = await invoke<OllamaPullOutcome | undefined>('ollama_pull_model', {
      modelName,
      baseUrl,
      allowPrivateNetwork,
    });
    return outcome === 'cancelled' ? 'cancelled' : 'completed';
  } catch (error) {
    throw new Error(`Failed to pull model '${modelName}': ${error}`);
  }
}

export async function ollamaCancelPull(modelName: string): Promise<boolean> {
  return invokeWithTimeout<boolean>('ollama_cancel_pull', { modelName });
}

export function onOllamaPullProgress(
  handler: (progress: OllamaPullProgress) => void,
): Promise<UnlistenFn> {
  return listen<OllamaPullProgress>('ollama:pull-progress', (event) => handler(event.payload));
}

export async function ollamaListLoadedModels(
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<OllamaLoadedModel[]> {
  const loaded = await invokeWithTimeout<OllamaLoadedModel[]>('ollama_list_loaded_models', {
    baseUrl,
    allowPrivateNetwork,
  });
  return Array.isArray(loaded) ? loaded : [];
}

export async function ollamaLoadModel(
  modelName: string,
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<void> {
  await invoke<void>('ollama_load_model', { modelName, baseUrl, allowPrivateNetwork });
}

export async function ollamaUnloadModel(
  modelName: string,
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<void> {
  await invoke<void>('ollama_unload_model', { modelName, baseUrl, allowPrivateNetwork });
}

export async function ollamaGetKeepAlive(): Promise<number | null> {
  return (await invokeWithTimeout<number | null>('ollama_get_keep_alive')) ?? null;
}

export async function ollamaSetKeepAlive(keepAliveSeconds: number | null): Promise<number | null> {
  return (
    (await invokeWithTimeout<number | null>('ollama_set_keep_alive', { keepAliveSeconds })) ?? null
  );
}

/**
 * Delete an installed Ollama model.
 *
 * @param modelName - The name of the model to delete
 * @throws Error if the model name is invalid or the deletion fails
 *
 * @example
 * ```ts
 * await ollamaDeleteModel(selectedModel.name);
 * console.log('Model deleted successfully');
 * ```
 */
export async function ollamaDeleteModel(
  modelName: string,
  baseUrl?: string,
  allowPrivateNetwork?: boolean,
): Promise<void> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    await invokeWithTimeout<void>('ollama_delete_model', {
      modelName,
      baseUrl,
      allowPrivateNetwork,
    });
  } catch (error) {
    throw new Error(`Failed to delete model '${modelName}': ${error}`);
  }
}

/**
 * OllamaClient provides a class-based interface for Ollama operations.
 *
 * @example
 * ```ts
 * const isAvailable = await OllamaClient.checkStatus();
 * if (isAvailable) {
 *   const models = await OllamaClient.listModels();
 * }
 * ```
 */
export class OllamaClient {
  static async checkStatus(baseUrl?: string): Promise<boolean> {
    return ollamaCheckStatus(baseUrl);
  }

  static async listModels(baseUrl?: string): Promise<OllamaModel[]> {
    return ollamaListModels(baseUrl);
  }

  static async pullModel(modelName: string, baseUrl?: string): Promise<OllamaPullOutcome> {
    return ollamaPullModel(modelName, baseUrl);
  }

  static async deleteModel(modelName: string, baseUrl?: string): Promise<void> {
    return ollamaDeleteModel(modelName, baseUrl);
  }

  static async isReadyForUse(baseUrl?: string): Promise<{
    available: boolean;
    modelCount: number;
    error?: string;
  }> {
    try {
      const isRunning = await ollamaCheckStatus(baseUrl);
      if (!isRunning) {
        return {
          available: false,
          modelCount: 0,
          error: 'Ollama is not running. Start it with: ollama serve',
        };
      }

      const models = await ollamaListModels(baseUrl);
      return {
        available: true,
        modelCount: models.length,
        error:
          models.length === 0
            ? 'No models installed. Pull one with: ollama pull <model-name>'
            : undefined,
      };
    } catch (error) {
      return {
        available: false,
        modelCount: 0,
        error: String(error),
      };
    }
  }
}

export default OllamaClient;
