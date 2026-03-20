/**
 * LLM Models API — typed wrappers for llm_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ChatMessageParam {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface LLMSendMessageRequest {
  messages: ChatMessageParam[];
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  preferCloudCredits?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
}

export interface ProviderStatus {
  provider: string;
  available: boolean;
  configured: boolean;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  ollamaRunning?: boolean;
}

export interface ProviderUsage {
  tokens: number;
  cost: number;
  messages: number;
}

export interface UsageStats {
  totalTokens: number;
  totalCost: number;
  messageCount: number;
  byProvider: Record<string, ProviderUsage>;
  byModel: Record<string, ProviderUsage>;
}

export interface RouterContext {
  [key: string]: unknown;
}

export interface RouterSuggestion {
  provider: string;
  model: string;
  reason: string;
}

// ---- Commands ----

export async function llmSendMessage(request: LLMSendMessageRequest): Promise<LLMResponse> {
  return command<LLMResponse>('llm_send_message', { request });
}

export async function llmConfigureProvider(
  provider: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<void> {
  return command<void>('llm_configure_provider', { provider, apiKey, baseUrl });
}

export async function llmSetDefaultProvider(provider: string): Promise<void> {
  return command<void>('llm_set_default_provider', { provider });
}

export async function llmEnsureManagedCloud(): Promise<boolean> {
  return command<boolean>('llm_ensure_managed_cloud');
}

export async function llmGetAvailableModels(): Promise<ModelInfo[]> {
  return command<ModelInfo[]>('llm_get_available_models');
}

export async function llmCheckProviderStatus(provider: string): Promise<ProviderStatus> {
  return command<ProviderStatus>('llm_check_provider_status', { provider });
}

export async function llmGetUsageStats(): Promise<UsageStats> {
  return command<UsageStats>('llm_get_usage_stats');
}

export async function llmListOllamaModels(): Promise<ModelInfo[]> {
  return command<ModelInfo[]>('llm_list_ollama_models');
}

export async function llmGetOllamaModels(): Promise<ModelInfo[]> {
  return command<ModelInfo[]>('llm_get_ollama_models');
}

export async function routerSuggestions(context?: RouterContext): Promise<RouterSuggestion> {
  return command<RouterSuggestion>('router_suggestions', { context });
}

export async function getModelCapabilities(
  provider: string,
  modelId: string,
  baseUrl?: string,
): Promise<unknown> {
  return command<unknown>('get_model_capabilities', { provider, modelId, baseUrl });
}

export async function clearModelCapabilityCache(): Promise<void> {
  return command<void>('clear_model_capability_cache');
}

export async function resetSessionCost(): Promise<void> {
  return command<void>('reset_session_cost');
}
