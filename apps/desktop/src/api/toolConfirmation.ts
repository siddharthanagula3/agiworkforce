/**
 * Tool Confirmation API
 *
 * TypeScript API wrappers for the tool confirmation dialog system.
 * Provides functions to interact with tool safety tiers and confirmation responses.
 */

import { invoke } from '../lib/tauri-mock';

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

/**
 * Safety tier determining user interaction required before tool execution.
 */
export type SafetyTier =
  'Safe' | 'RequiresNotification' | 'RequiresConfirmation' | 'RequiresExplicitApproval';

export interface ToolConfirmationSummary {
  request_id: string;
  tool_name: string;
  tool_display_name: string;
  description: string;
  parameters_summary: string;
  args: Record<string, unknown>;
  summary_hash: string;
  risk_level: RiskLevel;
  safety_tier: SafetyTier;
  reason: string;
  reversible: boolean;
  undo_description: string | null;
}

export interface ToolConfirmationResolution {
  allowedDirectories: string[] | null;
}

/**
 * Respond to a tool confirmation request.
 * Called when user approves or denies a tool execution.
 *
 * @param requestId - The unique ID of the confirmation request
 * @param approved - Whether the user approved the tool execution
 * @param rememberChoice - Whether to remember this choice for future executions
 * @param reason - Optional reason for the decision
 * @param rememberForSession - Whether to approve this tool for the current session
 * @param toolName - Canonical tool name required for session-scoped approval
 */
export async function respondToolConfirmation(
  requestId: string,
  approved: boolean,
  rememberChoice: boolean = false,
  reason?: string,
  rememberForSession: boolean = false,
  toolName?: string,
): Promise<ToolConfirmationResolution> {
  if (!requestId || requestId.trim().length === 0) {
    throw new Error('[toolConfirmation] requestId is required');
  }
  try {
    return await invoke<ToolConfirmationResolution>('respond_tool_confirmation', {
      requestId: requestId,
      approved,
      rememberChoice: rememberChoice,
      rememberForSession,
      toolName: toolName ?? null,
      reason: reason ?? null,
    });
  } catch (error) {
    console.error('[toolConfirmation] Failed to respond to confirmation:', error);
    throw error;
  }
}

export async function clearSessionToolApprovals(): Promise<void> {
  await invoke<void>('clear_session_tool_approvals');
}
