/**
 * Prompt Enhancement API — typed wrappers for prompt detection, enhancement, and routing commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface UseCaseDetection {
  useCase: string;
  confidence: number;
  suggestedProvider: string;
}
export interface EnhancedPrompt {
  original: string;
  enhanced: string;
  useCase: string;
  additions: string[];
}
export interface APIRoute {
  provider: string;
  model: string;
  reason: string;
}
export interface PromptEnhancementResult {
  enhanced: string;
  route: APIRoute;
  useCase: string;
}
export interface PromptEnhancementConfig {
  enabled: boolean;
  autoDetect: boolean;
  [key: string]: unknown;
}

// ---- Commands ----

export async function detectUseCase(text: string): Promise<UseCaseDetection> {
  return command<UseCaseDetection>('detect_use_case', { text });
}
export async function enhancePrompt(text: string): Promise<EnhancedPrompt> {
  return command<EnhancedPrompt>('enhance_prompt', { text });
}
export async function routeToBestApi(useCase: string, prompt: string): Promise<APIRoute> {
  return command<APIRoute>('route_to_best_api', { useCase, prompt });
}
export async function enhanceAndRoutePrompt(text: string): Promise<PromptEnhancementResult> {
  return command<PromptEnhancementResult>('enhance_and_route_prompt', { text });
}
export async function getPromptEnhancementConfig(): Promise<PromptEnhancementConfig> {
  return command<PromptEnhancementConfig>('get_prompt_enhancement_config');
}
export async function setPromptEnhancementConfig(config: PromptEnhancementConfig): Promise<void> {
  return command<void>('set_prompt_enhancement_config', { config });
}
export async function getSuggestedProvider(useCase: string): Promise<string> {
  return command<string>('get_suggested_provider', { useCase });
}
export async function getAvailableUseCases(): Promise<string[]> {
  return command<string[]>('get_available_use_cases');
}
export async function getAvailableProviders(): Promise<string[]> {
  return command<string[]>('get_available_providers');
}
