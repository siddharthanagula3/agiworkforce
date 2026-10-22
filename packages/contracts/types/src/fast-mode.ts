export type FastModeBlock = 'paid_plan' | 'workspace' | 'usage_credits';

export const FAST_MODE_BLOCK_MESSAGES: Readonly<Record<FastModeBlock, string>> = Object.freeze({
  paid_plan: 'Fast mode is available on paid plans and is billed to usage credits.',
  workspace: 'Fast mode has been disabled by your organization.',
  usage_credits: 'Fast mode is billed to usage credits. Turn them on in Settings > Billing.',
});

export interface FastModeConditions {
  offersFast: boolean;
  paidPlan: boolean | null;
  workspaceBlocks: boolean;
  usageCreditsOn: boolean | null;
}

export interface FastModeAvailability {
  allowed: boolean;
  block: FastModeBlock | null;
}

/**
 * Mirrors the chat route's fast mode refusals: a paid plan, a workspace that has
 * not turned it off, and usage credits turned on. An unknown plan is never
 * allowed; unknown usage credits are, because the server decides.
 */
export function resolveFastModeAvailability(conditions: FastModeConditions): FastModeAvailability {
  if (!conditions.offersFast) return { allowed: false, block: null };
  if (conditions.paidPlan === false) return { allowed: false, block: 'paid_plan' };
  if (conditions.workspaceBlocks) return { allowed: false, block: 'workspace' };
  if (conditions.usageCreditsOn === false) return { allowed: false, block: 'usage_credits' };
  return { allowed: conditions.paidPlan === true, block: null };
}

export function fastModeNeedsUsageCreditsCheck(
  conditions: Omit<FastModeConditions, 'usageCreditsOn'>,
): boolean {
  return conditions.offersFast && conditions.paidPlan === true && !conditions.workspaceBlocks;
}
