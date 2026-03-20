/**
 * Intent API — typed wrappers for intent_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface DetectedIntentResponse {
  intent: string;
  confidence: number;
  category: string;
  complexity: string;
  entities: Record<string, string>;
}
export interface RoutingPlanResponse {
  steps: { action: string; tool?: string; description: string }[];
  estimatedComplexity: string;
}
export interface OptimizationResultResponse {
  isQuickWin: boolean;
  suggestion?: string;
  estimatedTime?: string;
}
export interface IntentCategoryInfo {
  id: string;
  name: string;
  description: string;
  examples: string[];
}
export interface ComplexityInfo {
  level: string;
  description: string;
}
export interface IntentDetectorConfigRequest {
  [key: string]: unknown;
}

// ---- Commands ----

export async function intentDetect(prompt: string): Promise<DetectedIntentResponse> {
  return command<DetectedIntentResponse>('intent_detect', { prompt });
}
export async function intentDetectWithLlm(prompt: string): Promise<DetectedIntentResponse> {
  return command<DetectedIntentResponse>('intent_detect_with_llm', { prompt });
}
export async function intentCreateRoutingPlan(prompt: string): Promise<RoutingPlanResponse> {
  return command<RoutingPlanResponse>('intent_create_routing_plan', { prompt });
}
export async function intentCheckQuickWin(prompt: string): Promise<OptimizationResultResponse> {
  return command<OptimizationResultResponse>('intent_check_quick_win', { prompt });
}
export async function intentGetCategories(): Promise<IntentCategoryInfo[]> {
  return command<IntentCategoryInfo[]>('intent_get_categories');
}
export async function intentExtractEntities(prompt: string): Promise<Record<string, string>> {
  return command<Record<string, string>>('intent_extract_entities', { prompt });
}
export async function intentGetComplexityLevels(): Promise<ComplexityInfo[]> {
  return command<ComplexityInfo[]>('intent_get_complexity_levels');
}
export async function intentDetectBatch(prompts: string[]): Promise<DetectedIntentResponse[]> {
  return command<DetectedIntentResponse[]>('intent_detect_batch', { prompts });
}
export async function intentConfigure(config: IntentDetectorConfigRequest): Promise<void> {
  return command<void>('intent_configure', { config });
}
