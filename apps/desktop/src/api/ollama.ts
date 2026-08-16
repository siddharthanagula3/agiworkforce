
import { OLLAMA_TIMEOUT_MS } from '../constants/timeouts';
import { invoke } from '../lib/tauri-mock';

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

const OLLAMA_MODEL_PULL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

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
export async function ollamaCheckStatus(baseUrl?: string): Promise<boolean> {
  try {
    return await invokeWithTimeout<boolean>('ollama_check_status', { baseUrl });
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
export async function ollamaListModels(baseUrl?: string): Promise<OllamaModel[]> {
  try {
    return await invokeWithTimeout<OllamaModel[]>('ollama_list_models', { baseUrl });
  } catch (error) {
    throw new Error(`Failed to list Ollama models: ${error}`);
  }
}

/**
 * Get detailed information about a specific Ollama model.
 *
 * @param modelName - The provider-reported name of an installed model
 * @returns Model details including parameters and quantization
 * @throws Error if the model is not found or Ollama is not running
 *
 * @example
 * ```ts
 * const info = await ollamaGetModelInfo(selectedModel.name);
 * console.log(`Parameters: ${info.details.parameter_size}`);
 * ```
 */
export async function ollamaGetModelInfo(
  modelName: string,
  baseUrl?: string,
): Promise<OllamaModel> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    return await invokeWithTimeout<OllamaModel>('ollama_get_model_info', {
      modelName,
      baseUrl,
    });
  } catch (error) {
    throw new Error(`Failed to get model info for '${modelName}': ${error}`);
  }
}

/**
 * Pull (download) a model from Ollama.
 * Resolves after Ollama finishes the download.
 *
 * @param modelName - The model name selected by the user
 * @throws Error if the model name is invalid or the request fails
 *
 * @example
 * ```ts
 * await ollamaPullModel(modelName);
 * console.log('Model download initiated');
 * ```
 */
export async function ollamaPullModel(modelName: string, baseUrl?: string): Promise<void> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    await invokeWithTimeout<void>(
      'ollama_pull_model',
      { modelName, baseUrl },
      OLLAMA_MODEL_PULL_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(`Failed to pull model '${modelName}': ${error}`);
  }
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
export async function ollamaDeleteModel(modelName: string, baseUrl?: string): Promise<void> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    await invokeWithTimeout<void>('ollama_delete_model', { modelName, baseUrl });
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

  static async getModelInfo(modelName: string, baseUrl?: string): Promise<OllamaModel> {
    return ollamaGetModelInfo(modelName, baseUrl);
  }

  static async pullModel(modelName: string, baseUrl?: string): Promise<void> {
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
