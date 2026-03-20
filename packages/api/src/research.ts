/**
 * Research API — typed wrappers for research_* and process reasoning commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ResearchRequest {
  query: string;
  mode?: string;
  configOverrides?: Record<string, unknown>;
  taskId?: string;
}
export interface ResearchResponse {
  sessionId: string;
  status: string;
  results?: unknown[];
  report?: string;
}
export interface ResearchConfig {
  maxSteps?: number;
  maxSources?: number;
  provider?: string;
  [key: string]: unknown;
}
export interface ProcessTemplateDTO {
  id: string;
  name: string;
  description: string;
  steps: unknown[];
}
export interface TrackedOutcomeDTO {
  id: string;
  goalId: string;
  status: string;
  result?: unknown;
}
export interface ProcessStatDTO {
  processType: string;
  totalRuns: number;
  avgDuration: number;
  successRate: number;
}

// ---- Research ----

export async function researchStart(request: ResearchRequest): Promise<ResearchResponse> {
  return command<ResearchResponse>('research_start', { request });
}
export async function researchCancel(sessionId: string): Promise<boolean> {
  return command<boolean>('research_cancel', { sessionId });
}
export async function researchGetConfig(): Promise<ResearchConfig> {
  return command<ResearchConfig>('research_get_config');
}
export async function researchSetConfig(config: ResearchConfig): Promise<void> {
  return command<void>('research_set_config', { config });
}
export async function researchGetModes(): Promise<unknown[]> {
  return command<unknown[]>('research_get_modes');
}
export async function researchQuick(query: string): Promise<ResearchResponse> {
  return command<ResearchResponse>('research_quick', { query });
}
export async function researchCheckAvailability(): Promise<unknown> {
  return command<unknown>('research_check_availability');
}

// ---- Process Reasoning ----

export async function getProcessTemplates(): Promise<ProcessTemplateDTO[]> {
  return command<ProcessTemplateDTO[]>('get_process_templates');
}
export async function getOutcomeTracking(goalId: string): Promise<TrackedOutcomeDTO[]> {
  return command<TrackedOutcomeDTO[]>('get_outcome_tracking', { goalId });
}
export async function getProcessSuccessRates(): Promise<Record<string, number>> {
  return command<Record<string, number>>('get_process_success_rates');
}
export async function getBestPractices(processType: string): Promise<string[]> {
  return command<string[]>('get_best_practices', { processType });
}
export async function getProcessStatistics(): Promise<ProcessStatDTO[]> {
  return command<ProcessStatDTO[]>('get_process_statistics');
}
