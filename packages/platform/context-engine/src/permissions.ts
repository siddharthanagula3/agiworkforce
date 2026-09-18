import type { ContextSource, ContextSourceClass } from '@agiworkforce/context';
import type { ContextActor, ContextExclusionReason } from './types';

export interface OrganizationContextPolicy {
  readonly allowMemory: boolean;
  readonly allowPastChats: boolean;
  readonly allowConnectorResults: boolean;
  readonly allowWebResults: boolean;
}

export const OPEN_ORGANIZATION_CONTEXT_POLICY: OrganizationContextPolicy = {
  allowMemory: true,
  allowPastChats: true,
  allowConnectorResults: true,
  allowWebResults: true,
};

export const CLOSED_ORGANIZATION_CONTEXT_POLICY: OrganizationContextPolicy = {
  allowMemory: false,
  allowPastChats: false,
  allowConnectorResults: false,
  allowWebResults: false,
};

export type ContextCheck =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: ContextExclusionReason; readonly detail: string };

const ALLOWED: ContextCheck = { allowed: true };

function denied(reason: ContextExclusionReason, detail: string): ContextCheck {
  return { allowed: false, reason, detail };
}

const POLICY_FLAG: Partial<Record<ContextSourceClass, keyof OrganizationContextPolicy>> = {
  account_memory: 'allowMemory',
  past_chat: 'allowPastChats',
  project_sibling_chat: 'allowPastChats',
  connector_result: 'allowConnectorResults',
  web_result: 'allowWebResults',
};

/**
 * One ownership check for every class, so a loader cannot ship its own weaker
 * one: a source belongs to this actor, this workspace and this project, or it
 * is not in the turn.
 */
export function permissionCheck(source: ContextSource, actor: ContextActor): ContextCheck {
  const { provenance, trust } = source;

  if (provenance.ownerUserId !== undefined && provenance.ownerUserId !== actor.userId) {
    return denied('permission_denied', `${source.id} belongs to another account`);
  }
  if ((provenance.organizationId ?? null) !== actor.organizationId) {
    return denied('permission_denied', `${source.id} belongs to another workspace`);
  }
  if (provenance.projectId !== undefined && provenance.projectId !== (actor.projectId ?? null)) {
    return denied('permission_denied', `${source.id} belongs to another project`);
  }
  if (trust.isExternal && trust.isInstruction) {
    return denied('permission_denied', `${source.id} is external and cannot instruct the turn`);
  }
  return ALLOWED;
}

/**
 * The workspace's say over a class of context. Memory has been gated this way
 * since 0138; connector and web results answer to the same policy row rather
 * than to nothing.
 */
export function policyCheck(
  source: ContextSource,
  policy: OrganizationContextPolicy,
): ContextCheck {
  const flag = POLICY_FLAG[source.sourceClass];
  if (flag === undefined || policy[flag]) return ALLOWED;
  return denied('policy_denied', `this workspace does not allow ${source.sourceClass} context`);
}

export function contextSourceClassPolicyFlag(
  sourceClass: ContextSourceClass,
): keyof OrganizationContextPolicy | null {
  return POLICY_FLAG[sourceClass] ?? null;
}
