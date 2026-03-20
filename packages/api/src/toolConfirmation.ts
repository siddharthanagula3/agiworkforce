/**
 * Tool Confirmation API — typed wrappers for tool approval, safety, and agent mode commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface ToolSafetyTierInfo {
  tier: string;
  description: string;
  requiresApproval: boolean;
}
export type AgentMode = 'supervised' | 'autonomous' | 'restricted';

// ---- Commands ----

export async function respondToolConfirmation(
  requestId: string,
  approved: boolean,
  rememberChoice: boolean,
  rememberForSession?: boolean,
  toolName?: string,
  reason?: string,
): Promise<void> {
  return command<void>('respond_tool_confirmation', {
    requestId,
    approved,
    rememberChoice,
    rememberForSession,
    toolName,
    reason,
  });
}
export async function getToolSafetyTier(toolName: string): Promise<ToolSafetyTierInfo> {
  return command<ToolSafetyTierInfo>('get_tool_safety_tier', { toolName });
}
export async function getRememberedToolChoices(): Promise<Record<string, boolean>> {
  return command<Record<string, boolean>>('get_remembered_tool_choices');
}
export async function clearRememberedToolChoices(): Promise<void> {
  return command<void>('clear_remembered_tool_choices');
}
export async function clearRememberedToolChoice(toolName: string): Promise<void> {
  return command<void>('clear_remembered_tool_choice', { toolName });
}
export async function clearSessionToolApprovals(): Promise<void> {
  return command<void>('clear_session_tool_approvals');
}
export async function getPendingConfirmationCount(): Promise<number> {
  return command<number>('get_pending_confirmation_count');
}
export async function cancelToolConfirmation(requestId: string): Promise<void> {
  return command<void>('cancel_tool_confirmation', { requestId });
}
export async function updateAllowedDirectories(paths: string[]): Promise<void> {
  return command<void>('update_allowed_directories', { paths });
}
export async function getAllowedDirectories(): Promise<string[]> {
  return command<string[]>('get_allowed_directories');
}
export async function setAutoApproveAll(enabled: boolean): Promise<void> {
  return command<void>('set_auto_approve_all', { enabled });
}
export async function getAutoApproveAll(): Promise<boolean> {
  return command<boolean>('get_auto_approve_all');
}
export async function setAgentMode(mode: AgentMode): Promise<void> {
  return command<void>('set_agent_mode', { mode });
}
export async function getAgentMode(): Promise<AgentMode> {
  return command<AgentMode>('get_agent_mode');
}
export async function setToolApprovalPolicy(toolName: string, policy: string): Promise<void> {
  return command<void>('set_tool_approval_policy', { toolName, policy });
}
export async function getToolApprovalPolicy(toolName: string): Promise<string> {
  return command<string>('get_tool_approval_policy', { toolName });
}
export async function resolveTaskApproval(taskId: string, approved: boolean): Promise<void> {
  return command<void>('resolve_task_approval', { taskId, approved });
}
