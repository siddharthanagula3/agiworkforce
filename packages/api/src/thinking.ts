/**
 * Thinking API — typed wrappers for thinking_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ThinkingConfigResponse {
  enabled: boolean;
  budget: string;
  autoDetect: boolean;
}
export interface SetThinkingConfigRequest {
  enabled?: boolean;
  budget?: string;
  autoDetect?: boolean;
}
export interface ThinkingContent {
  thinking: string;
  model: string;
  tokens: number;
}

// ---- Commands ----

export async function thinkingGetConfig(): Promise<ThinkingConfigResponse> {
  return command<ThinkingConfigResponse>('thinking_get_config');
}
export async function thinkingSetConfig(
  request: SetThinkingConfigRequest,
): Promise<ThinkingConfigResponse> {
  return command<ThinkingConfigResponse>('thinking_set_config', { request });
}
export async function thinkingToggle(): Promise<boolean> {
  return command<boolean>('thinking_toggle');
}
export async function thinkingSetBudget(budget: string): Promise<ThinkingConfigResponse> {
  return command<ThinkingConfigResponse>('thinking_set_budget', { budget });
}
export async function thinkingDetectTrigger(message: string): Promise<ThinkingConfigResponse> {
  return command<ThinkingConfigResponse>('thinking_detect_trigger', { message });
}
export async function thinkingModelSupports(model: string): Promise<boolean> {
  return command<boolean>('thinking_model_supports', { model });
}
export async function thinkingGetCurrent(): Promise<ThinkingContent | null> {
  return command<ThinkingContent | null>('thinking_get_current');
}
