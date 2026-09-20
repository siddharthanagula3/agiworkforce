import type { CapabilityDenialReason } from '@agiworkforce/types';

import { recordDenial, type DenialLayer, type WorkspaceKind } from './metrics';

export const UNKNOWN_SURFACE = 'unknown';

export interface CapabilityDenialFacts {
  readonly layer: DenialLayer;
  readonly reason: CapabilityDenialReason;
  readonly surface?: string | null | undefined;
  /** null is personal scope; undefined is a call site that does not know. */
  readonly organizationId?: string | null | undefined;
}

export function workspaceKindFor(
  organizationId: string | null | undefined,
): WorkspaceKind | undefined {
  if (organizationId === undefined) return undefined;
  return organizationId === null ? 'personal' : 'organization';
}

/**
 * A refusal counted with a reason the repository already names. Drawing the
 * reason from the capability taxonomy is what stops the number on the dashboard
 * and the sentence the user reads from describing different refusals.
 */
export function recordCapabilityDenial(facts: CapabilityDenialFacts): void {
  recordDenial({
    layer: facts.layer,
    reason: facts.reason,
    surface: facts.surface ?? UNKNOWN_SURFACE,
    workspaceKind: workspaceKindFor(facts.organizationId),
  });
}
