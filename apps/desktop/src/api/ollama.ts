/**
 * Ollama API Wrapper
 *
 * Provides TypeScript API for managing local Ollama models.
 * Enables users to select local models for offline operation.
 *
 * Commands exposed:
 * - ollama_check_status - Check if Ollama server is running
 * - ollama_list_models - List all installed models
 * - ollama_get_model_info - Get detailed info about a specific model
 * - ollama_pull_model - Download a new model
 * - ollama_delete_model - Remove an installed model
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * Details about an Ollama model's configuration
 */
export interface OllamaModelDetails {
  /** Parameter size (e.g., "7B", "13B") */
  parameter_size: string;
  /** Quantization level (e.g., "Q4_0", "Q8_0") */
  quantization_level: string;
  /** Model family (e.g., "llama", "mistral") */
  family: string;
  /** Model families this model belongs to */
  families: string[];
  /** Parent model name */
  parent_model: string;
  /** Model format */
  format: string;
}

/**
 * Represents an Ollama model with its metadata
 */
export interface OllamaModel {
  /** The model name (e.g., "llama3.2:latest") */
  name: string;
  /** Size of the model in bytes */
  size: number;
  /** ISO 8601 timestamp of when the model was last modified */
  modified_at: string;
  /** Model digest/hash */
  digest: string;
  /** Additional model details */
  details: OllamaModelDetails;
}

// ============================================================================
// Configuration
// ============================================================================

const OLLAMA_TIMEOUT_MS = 10000;
const OLLAMA_PULL_TIMEOUT_MS = 60000; // Longer timeout for model pulls

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Invoke a Tauri command with timeout
 */
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

/**
 * Format model size in human-readable format
 */
export function formatModelSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ============================================================================
// API Functions
// ============================================================================

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
export async function ollamaCheckStatus(): Promise<boolean> {
  try {
    return await invokeWithTimeout<boolean>('ollama_check_status');
  } catch (error) {
    // Connection errors mean Ollama isn't running
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
export async function ollamaListModels(): Promise<OllamaModel[]> {
  try {
    return await invokeWithTimeout<OllamaModel[]>('ollama_list_models');
  } catch (error) {
    throw new Error(`Failed to list Ollama models: ${error}`);
  }
}

/**
 * Get detailed information about a specific Ollama model.
 *
 * @param modelName - The name of the model (e.g., "llama3.2:latest" or "llama3.2")
 * @returns Model details including parameters and quantization
 * @throws Error if the model is not found or Ollama is not running
 *
 * @example
 * ```ts
 * const info = await ollamaGetModelInfo('llama3.2');
 * console.log(`Parameters: ${info.details.parameter_size}`);
 * ```
 */
export async function ollamaGetModelInfo(modelName: string): Promise<OllamaModel> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    return await invokeWithTimeout<OllamaModel>('ollama_get_model_info', {
      model_name: modelName,
    });
  } catch (error) {
    throw new Error(`Failed to get model info for '${modelName}': ${error}`);
  }
}

/**
 * Pull (download) a model from Ollama.
 * Note: This initiates the download - the actual download happens in the background.
 *
 * @param modelName - The name of the model to pull (e.g., "llama3.2", "mistral:7b")
 * @throws Error if the model name is invalid or the request fails
 *
 * @example
 * ```ts
 * await ollamaPullModel('llama3.2');
 * console.log('Model download initiated');
 * ```
 */
export async function ollamaPullModel(modelName: string): Promise<void> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    await invokeWithTimeout<void>(
      'ollama_pull_model',
      { model_name: modelName },
      OLLAMA_PULL_TIMEOUT_MS,
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
 * await ollamaDeleteModel('llama3.2:latest');
 * console.log('Model deleted successfully');
 * ```
 */
export async function ollamaDeleteModel(modelName: string): Promise<void> {
  if (!modelName || modelName.trim().length === 0) {
    throw new Error('Model name cannot be empty');
  }

  try {
    await invokeWithTimeout<void>('ollama_delete_model', { model_name: modelName });
  } catch (error) {
    throw new Error(`Failed to delete model '${modelName}': ${error}`);
  }
}

// ============================================================================
// Client Class (Alternative API)
// ============================================================================

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
  /**
   * Check if Ollama is running
   */
  static async checkStatus(): Promise<boolean> {
    return ollamaCheckStatus();
  }

  /**
   * List all installed models
   */
  static async listModels(): Promise<OllamaModel[]> {
    return ollamaListModels();
  }

  /**
   * Get info about a specific model
   */
  static async getModelInfo(modelName: string): Promise<OllamaModel> {
    return ollamaGetModelInfo(modelName);
  }

  /**
   * Pull/download a model
   */
  static async pullModel(modelName: string): Promise<void> {
    return ollamaPullModel(modelName);
  }

  /**
   * Delete an installed model
   */
  static async deleteModel(modelName: string): Promise<void> {
    return ollamaDeleteModel(modelName);
  }

  /**
   * Check if Ollama is available and has at least one model installed
   */
  static async isReadyForUse(): Promise<{
    available: boolean;
    modelCount: number;
    error?: string;
  }> {
    try {
      const isRunning = await ollamaCheckStatus();
      if (!isRunning) {
        return {
          available: false,
          modelCount: 0,
          error: 'Ollama is not running. Start it with: ollama serve',
        };
      }

      const models = await ollamaListModels();
      return {
        available: true,
        modelCount: models.length,
        error:
          models.length === 0
            ? 'No models installed. Pull a model with: ollama pull llama3.2'
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
