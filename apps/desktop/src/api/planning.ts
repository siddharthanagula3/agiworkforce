import { invoke } from '../lib/tauri-mock';

export interface TaskStep {
  id: string;
  action: TaskAction;
  description: string;
  expectedResult?: string;
  timeout: number;
  retryOnFailure: boolean;
}

export type TaskAction =
  | { type: 'screenshot'; region?: ScreenRegion }
  | { type: 'click'; target: ClickTarget }
  | { type: 'type'; target: ClickTarget; text: string }
  | { type: 'navigate'; url: string }
  | { type: 'waitForElement'; target: ClickTarget; timeout: number }
  | { type: 'executeCommand'; command: string; args: string[] }
  | { type: 'readFile'; path: string }
  | { type: 'writeFile'; path: string; content: string }
  | { type: 'searchText'; query: string }
  | { type: 'scroll'; direction: string; amount: number }
  | { type: 'pressKey'; keys: string[] };

export interface ScreenRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ClickTarget =
  | { type: 'coordinates'; x: number; y: number }
  | { type: 'textMatch'; text: string; fuzzy?: boolean }
  | { type: 'imageMatch'; imagePath: string }
  | { type: 'uIAElement'; elementId: string };

export interface PlanPreviewResponse {
  description: string;
  steps: TaskStep[];
  stepCount: number;
}

export interface PlanExecuteResponse {
  taskId: string;
}

export async function previewPlan(description: string): Promise<PlanPreviewResponse> {
  return invoke<PlanPreviewResponse>('agent_preview_plan', { description });
}

export async function executePlan(
  description: string,
  steps: TaskStep[],
  autoApprove?: boolean,
): Promise<PlanExecuteResponse> {
  return invoke<PlanExecuteResponse>('agent_execute_plan', {
    description,
    steps,
    autoApprove,
  });
}
