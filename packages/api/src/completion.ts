/**
 * Completion API — typed wrappers for code/prompt completion Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface CompletionRequest {
  prompt: string;
  language: string;
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  tokens: number;
  latency: number;
}

export interface PromptCompletionRequest {
  input: string;
  context?: string;
}

export interface PromptCompletionResponse {
  suggestion: string;
  model: string;
  latencyMs: number;
}

// ---- Commands ----

export async function getCodeCompletion(request: CompletionRequest): Promise<CompletionResponse> {
  return command<CompletionResponse>('get_code_completion', { request });
}

export async function getInlineCompletion(
  contextBefore: string,
  contextAfter: string,
  language: string,
): Promise<string> {
  return command<string>('get_inline_completion', { contextBefore, contextAfter, language });
}

export async function getPromptCompletion(
  request: PromptCompletionRequest,
): Promise<PromptCompletionResponse> {
  return command<PromptCompletionResponse>('get_prompt_completion', { request });
}
