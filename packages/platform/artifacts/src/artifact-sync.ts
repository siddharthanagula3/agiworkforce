import type { SharedArtifact } from '@agiworkforce/types';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';

export type CloudArtifact = SharedArtifact & { deletedAt?: string | null };

export function mergeCloudArtifacts(
  local: ReadonlyArray<SharedArtifact>,
  cloud: ReadonlyArray<CloudArtifact>,
): SharedArtifact[] {
  const byId = new Map<string, SharedArtifact>();
  for (const a of local) byId.set(a.id, a);
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

export function isDerivedArtifact(a: SharedArtifact): boolean {
  return a.metadata?.['derived'] === true;
}

export function selectArtifactsToPush(artifacts: ReadonlyArray<SharedArtifact>): SharedArtifact[] {
  return artifacts.filter((a) => !isDerivedArtifact(a));
}

// is now defined once as a Zod schema in @agiworkforce/cloud-contracts; re-exported here
export type { ArtifactWireDelta };

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

export function applyArtifactDeltas(
  current: ReadonlyArray<CloudArtifact>,
  deltas: ReadonlyArray<ArtifactWireDelta>,
): CloudArtifact[] {
  const byId = new Map(current.map((a) => [a.id, a]));
  for (const d of deltas) {
    byId.set(d.id, wireToCloudArtifact(d));
  }
  return [...byId.values()];
}
