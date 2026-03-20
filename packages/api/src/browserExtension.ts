/**
 * Browser Extension Bridge API — typed wrappers for extension bridge commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface PageContext {
  url: string;
  title: string;
  content?: string;
  [key: string]: unknown;
}
export interface PageContextResponse {
  success: boolean;
  analysis?: unknown;
}
export interface FormData {
  fields: { name: string; type: string; value?: string }[];
  [key: string]: unknown;
}
export interface FormAnalysisResponse {
  suggestions: { field: string; value: string; confidence: number }[];
}
export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}
export interface TaskResultResponse {
  acknowledged: boolean;
}

// ---- Commands ----

export async function extensionPageContext(context: PageContext): Promise<PageContextResponse> {
  return command<PageContextResponse>('extension_page_context', { context });
}
export async function extensionAnalyzeForms(data: FormData): Promise<FormAnalysisResponse> {
  return command<FormAnalysisResponse>('extension_analyze_forms', { data });
}
export async function extensionTaskResult(result: TaskResult): Promise<TaskResultResponse> {
  return command<TaskResultResponse>('extension_task_result', { result });
}
export async function extensionStatus(): Promise<unknown> {
  return command<unknown>('extension_status');
}
