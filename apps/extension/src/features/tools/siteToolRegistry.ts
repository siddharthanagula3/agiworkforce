import {
  approvalRequirement,
  describeApprovalReason,
  type ActionApprovalRequirement,
} from '../computer-use/approvalPolicy';

export type SiteToolEffect = 'read' | 'write';

export interface SiteToolDescriptor {
  name: string;
  effect: SiteToolEffect;
  source: 'imperative' | 'declarative';
}

export interface SiteToolAnnotations {
  readOnlyHint?: unknown;
}

/**
 * A tool whose effect the page did not declare is treated as a write. The page
 * is the untrusted party here, so the cautious reading is the only safe default.
 */
export function effectFromAnnotations(
  annotations: SiteToolAnnotations | undefined,
): SiteToolEffect {
  return annotations?.readOnlyHint === true ? 'read' : 'write';
}

export function effectFromFormMethod(method: string | null | undefined): SiteToolEffect {
  return (method ?? '').trim().toLowerCase() === 'get' ? 'read' : 'write';
}

export interface SiteToolCallPlan {
  effect: SiteToolEffect;
  requiresApproval: boolean;
  requirement: ActionApprovalRequirement;
  reason: string | null;
}

/**
 * Site tools go through the same approval policy as every other browser action,
 * so a write on a bank or an identity provider cannot be run by a page-declared
 * tool when the equivalent click would have been stopped. A write on a page the
 * policy does not flag is governed by the run's autonomy setting, not by a
 * second per-call prompt.
 */
export function planSiteToolCall(
  tool: Pick<SiteToolDescriptor, 'name' | 'effect'>,
  args: Record<string, unknown>,
  pageUrl: string | null,
): SiteToolCallPlan {
  const requirement = approvalRequirement({ toolName: tool.name, args, pageUrl });
  return {
    effect: tool.effect,
    requiresApproval: requirement.alwaysAsk,
    requirement,
    reason: describeApprovalReason(requirement),
  };
}

export function describeSiteToolApproval(
  toolName: string,
  args: Record<string, unknown>,
  plan: SiteToolCallPlan,
): string {
  const argLines = Object.entries(args)
    .map(([key, value]) => `  ${key}: ${String(value).slice(0, 120)}`)
    .join('\n');
  const why = plan.reason ? `\n\n${plan.reason}` : '';
  return `AGI Workforce: the tool "${toolName}" on this page wants to run:\n\n${argLines}${why}\n\nClick OK to allow, or Cancel to stop.`;
}
