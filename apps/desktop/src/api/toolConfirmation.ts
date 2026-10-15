/**
 * Tool Confirmation API
 *
 * TypeScript API wrappers for the tool confirmation dialog system.
 * Provides functions to interact with tool safety tiers and confirmation responses.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

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
  if (!isTauri) {
    console.debug('[toolConfirmation] respondToolConfirmation (mock)', {
      requestId,
      approved,
      rememberChoice,
      reason,
      rememberForSession,
      toolName,
    });
    return { allowedDirectories: null };
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
  if (!isTauri) {
    console.debug('[toolConfirmation] clearSessionToolApprovals (mock)');
    return;
  }

  await invoke<void>('clear_session_tool_approvals');
}

/**
 * Get a user-friendly description for a safety tier.
 */
export function getSafetyTierDescription(tier: SafetyTier): string {
  const descriptions: Record<SafetyTier, string> = {
    Safe: 'This action is safe and will execute immediately.',
    RequiresNotification: "This action will execute, and you'll be notified in the activity panel.",
    RequiresConfirmation: 'This action requires your confirmation before proceeding.',
    RequiresExplicitApproval:
      'This action requires your explicit approval. Please review the details carefully.',
  };
  return descriptions[tier] || tier;
}

export function getRiskLevelLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    Low: 'Low Risk',
    Medium: 'Medium Risk',
    High: 'High Risk',
    Critical: 'Critical Risk',
  };
  return labels[level] || level;
}

export function getRiskLevelColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    Low: 'text-success-text',
    Medium: 'text-warning-text',
    High: 'text-danger-text',
    Critical: 'text-danger-text font-semibold',
  };
  return colors[level] || 'text-muted-foreground';
}

/**
 * Check if a safety tier requires user interaction.
 */
export function requiresUserAction(tier: SafetyTier): boolean {
  return tier === 'RequiresConfirmation' || tier === 'RequiresExplicitApproval';
}
