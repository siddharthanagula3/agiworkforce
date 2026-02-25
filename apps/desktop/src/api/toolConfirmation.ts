/**
 * Tool Confirmation API
 *
 * TypeScript API wrappers for the tool confirmation dialog system.
 * Provides functions to interact with tool safety tiers and confirmation responses.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/**
 * Risk level for a tool execution.
 */
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

/**
 * Safety tier determining user interaction required before tool execution.
 */
export type SafetyTier =
  | 'Safe'
  | 'RequiresNotification'
  | 'RequiresConfirmation'
  | 'RequiresExplicitApproval';

/**
 * Information about a tool's safety tier.
 */
export interface ToolSafetyTierInfo {
  tool_name: string;
  safety_tier: SafetyTier;
  safety_tier_description: string;
  requires_user_action: boolean;
  risk_level: RiskLevel | null;
}

/**
 * Summary of a tool confirmation request for display.
 */
export interface ToolConfirmationSummary {
  request_id: string;
  tool_name: string;
  tool_display_name: string;
  description: string;
  parameters_summary: string;
  risk_level: RiskLevel;
  safety_tier: SafetyTier;
  reason: string;
  reversible: boolean;
  undo_description: string | null;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Respond to a tool confirmation request.
 * Called when user approves or denies a tool execution.
 *
 * @param requestId - The unique ID of the confirmation request
 * @param approved - Whether the user approved the tool execution
 * @param rememberChoice - Whether to remember this choice for future executions
 * @param reason - Optional reason for the decision
 */
export async function respondToolConfirmation(
  requestId: string,
  approved: boolean,
  rememberChoice: boolean = false,
  reason?: string,
): Promise<void> {
  if (!requestId || requestId.trim().length === 0) {
    throw new Error('[toolConfirmation] requestId is required');
  }
  if (!isTauri) {
    console.info('[toolConfirmation] respondToolConfirmation (mock)', {
      requestId,
      approved,
      rememberChoice,
      reason,
    });
    return;
  }

  try {
    // Tauri converts snake_case Rust params to camelCase in TypeScript
    // So request_id in Rust becomes requestId in TypeScript
    await invoke<void>('respond_tool_confirmation', {
      requestId: requestId,
      approved,
      rememberChoice: rememberChoice,
      reason: reason ?? null,
    });
  } catch (error) {
    console.error('[toolConfirmation] Failed to respond to confirmation:', error);
    throw error;
  }
}

/**
 * Get the safety tier information for a specific tool.
 *
 * @param toolName - The name of the tool
 * @returns Information about the tool's safety tier
 */
export async function getToolSafetyTier(toolName: string): Promise<ToolSafetyTierInfo | null> {
  if (!isTauri) {
    console.info('[toolConfirmation] getToolSafetyTier (mock)', toolName);
    return {
      tool_name: toolName,
      safety_tier: 'Safe',
      safety_tier_description: 'This action is safe and will execute immediately.',
      requires_user_action: false,
      risk_level: 'Low',
    };
  }

  try {
    const result = await invoke<ToolSafetyTierInfo>('get_tool_safety_tier', {
      toolName: toolName,
    });
    return result;
  } catch (error) {
    console.error('[toolConfirmation] Failed to get tool safety tier:', error);
    return null;
  }
}

/**
 * Get all remembered tool choices.
 *
 * @returns Map of tool names to their remembered approval status
 */
export async function getRememberedToolChoices(): Promise<Record<string, boolean>> {
  if (!isTauri) {
    console.info('[toolConfirmation] getRememberedToolChoices (mock)');
    return {};
  }

  try {
    const result = await invoke<Record<string, boolean>>('get_remembered_tool_choices');
    return result;
  } catch (error) {
    console.error('[toolConfirmation] Failed to get remembered choices:', error);
    return {};
  }
}

/**
 * Clear all remembered tool choices.
 */
export async function clearRememberedToolChoices(): Promise<void> {
  if (!isTauri) {
    console.info('[toolConfirmation] clearRememberedToolChoices (mock)');
    return;
  }

  try {
    await invoke<void>('clear_remembered_tool_choices');
  } catch (error) {
    console.error('[toolConfirmation] Failed to clear remembered choices:', error);
    throw error;
  }
}

/**
 * Clear a specific remembered tool choice.
 *
 * @param toolName - The name of the tool to clear the remembered choice for
 */
export async function clearRememberedToolChoice(toolName: string): Promise<void> {
  if (!isTauri) {
    console.info('[toolConfirmation] clearRememberedToolChoice (mock)', toolName);
    return;
  }

  try {
    await invoke<void>('clear_remembered_tool_choice', { toolName: toolName });
  } catch (error) {
    console.error('[toolConfirmation] Failed to clear remembered choice:', error);
    throw error;
  }
}

/**
 * Get the count of pending confirmation requests.
 *
 * @returns The number of pending confirmations
 */
export async function getPendingConfirmationCount(): Promise<number> {
  if (!isTauri) {
    console.info('[toolConfirmation] getPendingConfirmationCount (mock)');
    return 0;
  }

  try {
    const result = await invoke<number>('get_pending_confirmation_count');
    return result;
  } catch (error) {
    console.error('[toolConfirmation] Failed to get pending count:', error);
    return 0;
  }
}

/**
 * Cancel a pending tool confirmation request.
 * Use this when the user closes the dialog without responding.
 *
 * @param requestId - The unique ID of the confirmation request to cancel
 */
export async function cancelToolConfirmation(requestId: string): Promise<void> {
  if (!requestId || requestId.trim().length === 0) {
    throw new Error('[toolConfirmation] requestId is required');
  }
  if (!isTauri) {
    console.info('[toolConfirmation] cancelToolConfirmation (mock)', requestId);
    return;
  }

  try {
    await invoke<void>('cancel_tool_confirmation', { requestId: requestId });
  } catch (error) {
    console.error('[toolConfirmation] Failed to cancel confirmation:', error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

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

/**
 * Get a user-friendly label for a risk level.
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    Low: 'Low Risk',
    Medium: 'Medium Risk',
    High: 'High Risk',
    Critical: 'Critical Risk',
  };
  return labels[level] || level;
}

/**
 * Get a color class for a risk level (for UI styling).
 */
export function getRiskLevelColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    Low: 'text-green-500',
    Medium: 'text-amber-500',
    High: 'text-orange-500',
    Critical: 'text-destructive',
  };
  return colors[level] || 'text-muted-foreground';
}

/**
 * Check if a safety tier requires user interaction.
 */
export function requiresUserAction(tier: SafetyTier): boolean {
  return tier === 'RequiresConfirmation' || tier === 'RequiresExplicitApproval';
}
