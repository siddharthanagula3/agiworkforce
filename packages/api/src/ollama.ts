/**
 * Ollama API — typed wrappers for ollama_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface OllamaModelDetails {
  parameterSize: string;
  quantizationLevel: string;
  family: string;
  families: string[];
  parentModel: string;
  format: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
  digest: string;
  details: OllamaModelDetails;
}

// ---- Commands ----

export async function ollamaCheckStatus(): Promise<boolean> {
  return command<boolean>('ollama_check_status');
}

export async function ollamaListModels(): Promise<OllamaModel[]> {
  return command<OllamaModel[]>('ollama_list_models');
}

export async function ollamaGetModelInfo(modelName: string): Promise<OllamaModel> {
  return command<OllamaModel>('ollama_get_model_info', { modelName });
}

export async function ollamaPullModel(modelName: string): Promise<void> {
  return command<void>('ollama_pull_model', { modelName });
}

export async function ollamaDeleteModel(modelName: string): Promise<void> {
  return command<void>('ollama_delete_model', { modelName });
}
