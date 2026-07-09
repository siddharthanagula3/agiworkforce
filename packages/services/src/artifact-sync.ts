/**
 * Artifact cloud-sync merge logic (canonical, cross-surface).
 *
 * The pure rules every surface applies when reconciling LOCALLY-DERIVED artifacts (re-derived
 * from message content; identical on every device) with PULLED CLOUD artifacts (the managed
 * synced entity — edited or desktop-authored-from-scratch). Keeping this in one place means
 * web / desktop / mobile render and push identically.
 *
 * See docs/plans/artifact-cloud-sync-design-2026-06-21.md §4 and the `/api/chat/sync`
 * endpoint (migration 0039). No I/O, no platform deps — surfaces own the transport.
 *
 * @module artifact-sync
 */

import type { SharedArtifact } from '@agiworkforce/types';
import type { ArtifactWireDelta } from './cloud-contracts/sync';

/**
 * A pulled cloud artifact: the canonical `SharedArtifact` plus the sync tombstone. Surfaces map
 * the wire delta (`deleted_at`) onto `deletedAt` when ingesting; locally-derived artifacts have
 * no tombstone.
 */
export type CloudArtifact = SharedArtifact & { deletedAt?: string | null };

/**
 * The render set on EVERY surface = (locally derived) ⊕ (pulled cloud), merged by id, with the
 * CLOUD row winning (it is the edited/authoritative copy). A cloud tombstone (`deletedAt`)
 * removes the artifact from the render set entirely (even if a local derived copy exists).
 *
 * Because derived ids are deterministic (`uuidv5(conversationId:messageId:ordinal)`), an edited
 * cloud artifact overlays exactly the derived artifact it came from.
 */
export function mergeCloudArtifacts(
  local: ReadonlyArray<SharedArtifact>,
  cloud: ReadonlyArray<CloudArtifact>,
): SharedArtifact[] {
  const byId = new Map<string, SharedArtifact>();
  for (const a of local) byId.set(a.id, a);
  // Cloud wins. A tombstoned cloud row deletes the id from the merged set.
  for (const c of cloud) {
    if (c.deletedAt) {
      byId.delete(c.id);
    } else {
      const { deletedAt: _drop, ...artifact } = c;
      byId.set(c.id, artifact);
    }
  }
  return [...byId.values()];
}

/** True when an artifact is a deterministic projection of message content (re-derivable). */
export function isDerivedArtifact(a: SharedArtifact): boolean {
  return a.metadata?.['derived'] === true;
}

/**
 * The artifacts a surface should PUSH to the cloud: ONLY non-re-derivable ones — edited
 * artifacts (whose content diverged from the message) and desktop-authored-from-scratch
 * artifacts. Un-edited derived artifacts are NEVER pushed: every surface re-derives them
 * identically from the already-synced message, so pushing them would duplicate state.
 *
 * (Today only desktop has edit-in-place, so in practice only desktop produces a non-empty push
 * set; web/mobile are pull-only. This keeps the cloud table minimal.)
 */
export function selectArtifactsToPush(artifacts: ReadonlyArray<SharedArtifact>): SharedArtifact[] {
  return artifacts.filter((a) => !isDerivedArtifact(a));
}

// The snake_case artifact delta returned by `GET /api/chat/sync` (migration 0039)
// is now defined once as a Zod schema in cloud-contracts/sync.ts; re-exported here
// so existing `ArtifactWireDelta` importers keep working.
export type { ArtifactWireDelta };

/** Map a sync wire delta to the client-domain `CloudArtifact` (SharedArtifact + tombstone). */
export function wireToCloudArtifact(d: ArtifactWireDelta): CloudArtifact {
  return {
    id: d.id,
    type: d.artifact_type as SharedArtifact['type'],
    title: d.title ?? '',
    content: d.content,
    language: d.language ?? undefined,
    version: d.current_version,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    conversationId: d.conversation_id,
    messageId: d.message_id ?? undefined,
    metadata: { pinned: d.pinned, tags: d.tags, serverVersion: d.server_version },
    deletedAt: d.deleted_at,
  };
}

/**
 * Apply pulled artifact deltas to a surface's CURRENT persisted cloud-artifact set. Upsert by
 * id; a tombstone (`deleted_at`) removes it. PURE — the surface persists the returned set, then
 * renders `mergeCloudArtifacts(localDerived, returnedSet)`. Each surface's sync engine calls
 * this (web/desktop/mobile) so the apply logic lives in ONE place.
 *
 * Deltas arrive ordered by `server_version asc` (server contract), so a later delta for the
 * same id naturally wins.
 */
export function applyArtifactDeltas(
  current: ReadonlyArray<CloudArtifact>,
  deltas: ReadonlyArray<ArtifactWireDelta>,
): CloudArtifact[] {
  const byId = new Map(current.map((a) => [a.id, a]));
  for (const d of deltas) {
    if (d.deleted_at) byId.delete(d.id);
    else byId.set(d.id, wireToCloudArtifact(d));
  }
  return [...byId.values()];
}
