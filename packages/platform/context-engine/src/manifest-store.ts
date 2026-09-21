import {
  CONTEXT_ASSEMBLER_VERSION,
  CONTEXT_VERSION_KEYS,
  UNVERSIONED_CONTEXT,
  type ContextActor,
  type ContextManifest,
  type ContextManifestEntry,
  type ContextManifestStore,
  type ContextVersions,
} from './types';

export interface ContextManifestQueryClient {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface ContextManifestRow {
  manifest_id: string | null;
  turn_id: string;
  assembler_version: string | null;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  created_at: string | Date;
  included_count: number;
  budget_used_chars: number;
  token_estimate: number | null;
  actual_token_count: number | null;
  budget_tokens: number | null;
  reserved_output_tokens: number | null;
  over_budget: boolean | null;
  temporary_chat: boolean | null;
  versions: Partial<ContextVersions> | null;
  content_digest: string;
  entries: ContextManifestEntry[] | null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function readVersions(value: Partial<ContextVersions> | null): ContextVersions {
  const versions: Record<string, string> = { ...UNVERSIONED_CONTEXT };
  for (const key of CONTEXT_VERSION_KEYS) {
    const recorded = value?.[key];
    if (typeof recorded === 'string' && recorded) versions[key] = recorded;
  }
  return versions as ContextVersions;
}

export function createPostgresContextManifestStore(
  db: ContextManifestQueryClient,
): ContextManifestStore {
  return {
    async write(manifest: ContextManifest): Promise<void> {
      await db.query(
        `insert into public.context_manifests
           (turn_id, manifest_id, assembler_version, user_id, organization_id, project_id,
            created_at, included_count, budget_used_chars, token_estimate, actual_token_count,
            budget_tokens, reserved_output_tokens, over_budget, temporary_chat, versions,
            content_digest, entries)
         values ($1, $2, $3, $4, $5::uuid, $6::uuid, $7::timestamptz, $8, $9, $10, $11,
                 $12, $13, $14, $15, $16::jsonb, $17, $18::jsonb)
         on conflict (turn_id) do update
           set manifest_id = excluded.manifest_id,
               assembler_version = excluded.assembler_version,
               included_count = excluded.included_count,
               budget_used_chars = excluded.budget_used_chars,
               token_estimate = excluded.token_estimate,
               actual_token_count = excluded.actual_token_count,
               budget_tokens = excluded.budget_tokens,
               reserved_output_tokens = excluded.reserved_output_tokens,
               over_budget = excluded.over_budget,
               temporary_chat = excluded.temporary_chat,
               versions = excluded.versions,
               content_digest = excluded.content_digest,
               entries = excluded.entries
           where context_manifests.user_id = excluded.user_id`,
        [
          manifest.turnId,
          manifest.manifestId,
          manifest.assemblerVersion,
          manifest.actor.userId,
          manifest.actor.organizationId,
          manifest.actor.projectId ?? null,
          manifest.createdAt,
          manifest.includedCount,
          manifest.budgetUsedChars,
          manifest.tokenEstimate,
          manifest.actualTokenCount,
          manifest.budgetTokens,
          manifest.reservedOutputTokens,
          manifest.overBudget,
          manifest.temporaryChat,
          JSON.stringify(manifest.versions),
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
        `select turn_id, manifest_id, assembler_version, user_id,
                organization_id::text as organization_id,
                project_id::text as project_id, created_at, included_count,
                budget_used_chars, token_estimate, actual_token_count, budget_tokens,
                reserved_output_tokens, over_budget, temporary_chat, versions,
                content_digest, entries
           from public.context_manifests
          where turn_id = $1 and user_id = $2
          limit 1`,
        [turnId, actor.userId],
      );
      if (!row) return null;
      return {
        manifestId: row.manifest_id ?? row.turn_id,
        turnId: row.turn_id,
        assemblerVersion: row.assembler_version ?? CONTEXT_ASSEMBLER_VERSION,
        createdAt: toIso(row.created_at),
        actor: {
          userId: row.user_id,
          organizationId: row.organization_id,
          projectId: row.project_id,
        },
        versions: readVersions(row.versions),
        temporaryChat: row.temporary_chat === true,
        entries: row.entries ?? [],
        includedCount: row.included_count,
        budgetUsedChars: row.budget_used_chars,
        tokenEstimate: row.token_estimate ?? 0,
        actualTokenCount: row.actual_token_count,
        budgetTokens: row.budget_tokens,
        reservedOutputTokens: row.reserved_output_tokens,
        overBudget: row.over_budget === true,
        contentDigest: row.content_digest,
      };
    },
  };
}
