import type {
  ContextActor,
  ContextManifest,
  ContextManifestEntry,
  ContextManifestStore,
} from './types';

export interface ContextManifestQueryClient {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface ContextManifestRow {
  turn_id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  created_at: string | Date;
  included_count: number;
  budget_used_chars: number;
  content_digest: string;
  entries: ContextManifestEntry[] | null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function createPostgresContextManifestStore(
  db: ContextManifestQueryClient,
): ContextManifestStore {
  return {
    async write(manifest: ContextManifest): Promise<void> {
      await db.query(
        `insert into public.context_manifests
           (turn_id, user_id, organization_id, project_id, created_at,
            included_count, budget_used_chars, content_digest, entries)
         values ($1, $2, $3::uuid, $4::uuid, $5::timestamptz, $6, $7, $8, $9::jsonb)
         on conflict (turn_id) do update
           set included_count = excluded.included_count,
               budget_used_chars = excluded.budget_used_chars,
               content_digest = excluded.content_digest,
               entries = excluded.entries
         where context_manifests.user_id = excluded.user_id`,
        [
          manifest.turnId,
          manifest.actor.userId,
          manifest.actor.organizationId,
          manifest.actor.projectId ?? null,
          manifest.createdAt,
          manifest.includedCount,
          manifest.budgetUsedChars,
          manifest.contentDigest,
          JSON.stringify(manifest.entries),
        ],
      );
    },

    async read(
      turnId: string,
      actor: Pick<ContextActor, 'userId'>,
    ): Promise<ContextManifest | null> {
      const [row] = await db.query<ContextManifestRow>(
        `select turn_id, user_id, organization_id::text as organization_id,
                project_id::text as project_id, created_at, included_count,
                budget_used_chars, content_digest, entries
           from public.context_manifests
          where turn_id = $1 and user_id = $2
          limit 1`,
        [turnId, actor.userId],
      );
      if (!row) return null;
      return {
        turnId: row.turn_id,
        createdAt: toIso(row.created_at),
        actor: {
          userId: row.user_id,
          organizationId: row.organization_id,
          projectId: row.project_id,
        },
        entries: row.entries ?? [],
        includedCount: row.included_count,
        budgetUsedChars: row.budget_used_chars,
        contentDigest: row.content_digest,
      };
    },
  };
}
