import 'server-only';

import type { OrganizationRole } from '@agiworkforce/types';

import { createError } from '@/lib/errors';

export type OwnerAction = 'remove' | 'demote' | 'transfer';

export interface OwnerProtectionInput {
  actorRole: OrganizationRole | null;
  targetRole: OrganizationRole;
  ownerCount: number;
  action: OwnerAction;
}

const OWNER_ACTION_VERB: Readonly<Record<OwnerAction, string>> = {
  remove: 'remove',
  demote: 'change the role of',
  transfer: 'transfer ownership away from',
};

/**
 * The invariant every owner-touching flow shares: the workspace never ends up
 * with no owner, and an admin never acts on an owner at all, however many
 * owners there are.
 */
export function assertOwnerProtection(input: OwnerProtectionInput): void {
  if (input.targetRole !== 'owner') return;

  if (input.actorRole !== 'owner') {
    throw createError
      .forbidden(`Only a workspace owner can ${OWNER_ACTION_VERB[input.action]} another owner.`)
      .asUserSafe();
  }
  if (input.ownerCount <= 1) {
    throw createError.conflict(
      'Assign another owner before removing or changing the last owner. A workspace without an owner cannot be recovered.',
    );
  }
}
