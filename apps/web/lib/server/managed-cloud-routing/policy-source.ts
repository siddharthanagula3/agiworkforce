import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { managedCloudDataRegion, readOrganizationRegion } from '@/lib/server/data-region';
import { getNeonDb } from '@/lib/server/neon-db';
import { readProviderTrainingOptOut } from '@/lib/server/provider-training-opt-out';
import { conversationKeepsOutOfTraining } from '@/lib/services/health-space-service';
import { readModelPolicy } from '@/lib/services/model-policy-service';
import type { ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import { resolveZeroDataRetentionPolicy } from '@/lib/services/organization-policy-gate';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';
import { resolveUserRoutingPreferences } from '@/lib/services/user-routing-preferences';
import { resolveZeroDataRetentionProviderOverrides } from '@/lib/services/zero-data-retention-provider-overrides';

export interface ManagedCloudAccount {
  /** The caller's scoped handle; null reads through a handle claimed for this account. */
  db: DatabaseAdapter | null;
  userId: string;
  organizationId: string | null;
  conversationId?: string | null;
}

/**
 * Where the per-account rules come from. A read that cannot answer resolves
 * the safe way where a safe answer exists (training opt-out and a
 * conversation's training state count as on) and throws where none does
 * (workspace model policy, zero retention, workspace region), so admission
 * refuses rather than routes around a rule it could not read. The US-only
 * preference is the user's own and fails open; a workspace-level prohibition
 * belongs in the workspace policy, which fails closed.
 */
export interface ManagedCloudPolicySource {
  trainingOptOut(account: ManagedCloudAccount): Promise<boolean>;
  conversationKeepsOutOfTraining(account: ManagedCloudAccount): Promise<boolean>;
  zeroDataRetentionRequired(account: ManagedCloudAccount): Promise<boolean>;
  workspaceModelPolicy(account: ManagedCloudAccount): Promise<ModelAccessPolicy | null>;
  workspaceRegion(account: ManagedCloudAccount): Promise<string | null>;
  usOnly(account: ManagedCloudAccount): Promise<boolean>;
  deploymentRegion(): string | null;
  availableProviderIds(): ReadonlySet<string>;
  zeroDataRetentionProviders(): ReadonlySet<string>;
}

function scopedDb(account: ManagedCloudAccount): DatabaseAdapter {
  return (
    account.db ??
    createClaimedUserScopedDb(getNeonDb(), {
      userId: account.userId,
      organizationId: account.organizationId,
    })
  );
}

export const productionPolicySource: ManagedCloudPolicySource = {
  async trainingOptOut(account) {
    try {
      return await readProviderTrainingOptOut(scopedDb(account), account.userId);
    } catch (error) {
      logger.warn(
        { error, userId: account.userId },
        '[managed-cloud-routing] training opt-out unreadable; routing as opted out',
      );
      return true;
    }
  },
  async conversationKeepsOutOfTraining(account) {
    if (!account.conversationId) return false;
    return conversationKeepsOutOfTraining(
      scopedDb(account),
      account.userId,
      account.conversationId,
    );
  },
  async zeroDataRetentionRequired(account) {
    return (await resolveZeroDataRetentionPolicy(scopedDb(account), account.userId)).required;
  },
  async workspaceModelPolicy(account) {
    if (!account.organizationId) return null;
    return readModelPolicy(scopedDb(account), account.organizationId);
  },
  async workspaceRegion(account) {
    if (!account.organizationId) return null;
    return (await readOrganizationRegion(scopedDb(account), account.organizationId)).effective;
  },
  async usOnly(account) {
    return (await resolveUserRoutingPreferences(scopedDb(account), account.userId)).usOnly;
  },
  deploymentRegion: () => managedCloudDataRegion(),
  availableProviderIds: () => listAvailableManagedProviderIds(),
  zeroDataRetentionProviders: () => resolveZeroDataRetentionProviderOverrides(),
};
