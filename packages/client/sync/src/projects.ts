/**
 * Cloud project delta mapping — pure logic extracted from mobile's
 * cloudSyncEngine.ts (pullProjects's snake→camel mapping only).
 *
 * SCOPE NOTE: unlike memory.ts, the upsert/tombstone REDUCER stays
 * surface-owned (mobile: cloudProjectStore.applyCloudProjectDeltas) and is
 * NOT extracted here. That reducer also clears the store's `activeProjectId`
 * selection when a tombstone hits the currently-active project — a piece of
 * local UI state with no wire representation, and cloudProjectStore.ts is
 * independently exercised by apps/mobile/__tests__/cloud-project-active.test.ts
 * calling the store action directly. Duplicating the activeProjectId rule
 * into a shared reducer would create a second copy that could drift from the
 * one under direct test; only the mapping (the part with a single owner and a
 * clear wire contract) is shared.
 */
import type { ProjectWireDelta } from '@agiworkforce/cloud-contracts';

export type SyncProjectSource = 'mobile' | 'desktop' | 'web';

/** The fields every surface's local cloud-project record needs for delta-sync apply. */
export interface SyncProjectRecord {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  source: SyncProjectSource;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Server-owned optimistic-concurrency revision. */
  serverVersion: string;
}

/**
 * Map a wire project delta (snake_case) to the client-domain record
 * (camelCase). Pulled rows may come from any surface and the wire format
 * carries no `source` field, so pulled rows are tagged 'web' (matches every
 * surface's current convention).
 */
export function mapProjectWireDelta(delta: ProjectWireDelta): SyncProjectRecord {
  return {
    id: delta.id,
    name: delta.name,
    description: delta.description,
    instructions: delta.instructions,
    color: delta.color,
    isArchived: delta.is_archived,
    metadata: delta.metadata,
    source: 'web',
    createdAt: delta.created_at,
    updatedAt: delta.updated_at,
    deletedAt: delta.deleted_at,
    serverVersion: delta.server_version,
  };
}
