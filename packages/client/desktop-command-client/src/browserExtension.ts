/**
 * Browser Extension Bridge API — typed wrappers for extension bridge commands.
 */

import { command } from '@agiworkforce/client-runtime';

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

/**
 * Diagnostics payload returned by the Tauri `extension_status` command.
 * Used by Desktop surfaces to render Chrome + VS Code bridge health
 * (PLAN section 6: "Add Chrome and VS Code bridge status to connector hub").
 */
export interface ExtensionStatusDiagnostics {
  status?: string;
  version?: string;
  timestamp?: string;
  extension_support?: boolean;
  transport?: {
    native_messaging?: boolean;
    websocket_port?: number;
  };
  diagnostics?: {
    recommendations?: string[];
    realtime_token?: {
      path?: string;
      exists?: boolean;
      valid?: boolean;
      error?: string | null;
    };
    native_connection?: {
      state?: string;
      extension_id?: string | null;
      ready?: boolean;
    };
    vscode_connection?: {
      state?: string;
      ready?: boolean;
    };
  };
  commands?: string[];
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
export async function extensionStatus(): Promise<ExtensionStatusDiagnostics> {
  return command<ExtensionStatusDiagnostics>('extension_status');
}
