import { command } from '@agiworkforce/client-runtime';

export type HookEventType =
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'ToolError'
  | 'StepStart'
  | 'StepCompleted'
  | 'StepError'
  | 'GoalStart'
  | 'GoalCompleted'
  | 'GoalError'
  | 'UserPromptSubmit'
  | 'ApprovalRequired'
  | 'ApprovalGranted'
  | 'ApprovalDenied';

export interface HookVariable {
  name: string;
  shown: string | null;
}
export interface Hook {
  name: string;
  events: HookEventType[];
  priority: number;
  command: string;
  enabled: boolean;
  timeout_secs: number;
  env: HookVariable[];
  working_dir?: string;
  continue_on_error: boolean;
}
export type HookEdit = Omit<Hook, 'env'>;
export interface WaitingHooks {
  hooks: Hook[];
  problem: string | null;
  holdsTools: boolean;
}
export interface HookStats {
  totalRuns: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
  lastExecution: string | null;
}

export async function hooksInitialize(): Promise<string> {
  return command<string>('hooks_initialize');
}
export async function hooksList(): Promise<Hook[]> {
  return command<Hook[]>('hooks_list');
}
export async function hooksWaitingForApproval(): Promise<WaitingHooks | null> {
  return command<WaitingHooks | null>('hooks_waiting_for_approval');
}
export async function hooksAdd(hook: HookEdit): Promise<string> {
  return command<string>('hooks_add', { hook });
}
export async function hooksRemove(name: string): Promise<string> {
  return command<string>('hooks_remove', { name });
}
export async function hooksToggle(name: string, enabled: boolean): Promise<string> {
  return command<string>('hooks_toggle', { name, enabled });
}
export async function hooksUpdate(hook: HookEdit): Promise<string> {
  return command<string>('hooks_update', { hook });
}
export async function hooksExport(): Promise<string | null> {
  return command<string | null>('hooks_export');
}
export async function hooksImport(yaml: string): Promise<string> {
  return command<string>('hooks_import', { yaml });
}
export async function hooksReload(): Promise<string> {
  return command<string>('hooks_reload');
}
export async function hooksGetEventTypes(): Promise<HookEventType[]> {
  return command<HookEventType[]>('hooks_get_event_types');
}
export async function hooksGetStats(name: string): Promise<HookStats | null> {
  return command<HookStats | null>('hooks_get_stats', { name });
}
