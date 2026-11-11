import 'server-only';

import { createHash } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { objectKeyFromStorageUri } from '../../lib/server/object-storage';

export const KNOWLEDGE_KEY_NORMALIZATION_LIMIT = 10_000;
const MAX_STORAGE_URI_BYTES = 8_192;

interface ReferenceRow {
  id: string;
  project_id: string;
  user_id: string;
  organization_id: string | null;
  storage_uri: string | null;
  active: boolean;
}

export interface KnowledgeKeyNormalizationReport {
  review: string;
  references: number;
  conversions: number;
  unresolved: number;
  conflictingKeys: number;
  ready: boolean;
  applied: boolean;
}

export class KnowledgeKeyNormalizationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeKeyNormalizationRefused';
  }
}

export async function normalizeProjectKnowledgeKeys(
  db: Pick<DatabaseAdapter, 'transaction'>,
  input: { review?: string },
): Promise<KnowledgeKeyNormalizationReport> {
  if (input.review !== undefined && !/^[a-f0-9]{64}$/.test(input.review)) {
    throw new KnowledgeKeyNormalizationRefused(
      'Apply requires the exact reviewed inventory digest.',
    );
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      input.review === undefined
        ? 'set transaction isolation level repeatable read, read only'
        : 'set transaction isolation level read committed',
    );
    await tx.execute("set local lock_timeout = '5s'");
    await tx.execute("set local statement_timeout = '120s'");
    // Refuse an RLS-filtered inventory instead of silently omitting another owner's rows.
    await tx.execute('set local row_security = off');
    if (input.review !== undefined) {
      await tx.execute(
        'lock table public.user_projects, public.project_knowledge_files in share row exclusive mode',
      );
      const [lifecycle] = await tx.query<{ relation: string | null }>(
        "select to_regclass('public.project_knowledge_objects') as relation",
      );
      if (lifecycle?.relation) {
        throw new KnowledgeKeyNormalizationRefused(
          'Normalize legacy references before installing the object lifecycle fence.',
        );
      }
    }
    const rows = await tx.query<ReferenceRow>(
      `select f.id, f.project_id, p.user_id, p.organization_id,
              case when octet_length(f.storage_uri) <= $2 then f.storage_uri else null end as storage_uri,
              f.deleted_at is null as active
         from public.project_knowledge_files f
         join public.user_projects p on p.id = f.project_id
        where nullif(f.storage_uri, '') is not null
        order by f.id
        limit $1`,
      [KNOWLEDGE_KEY_NORMALIZATION_LIMIT + 1, MAX_STORAGE_URI_BYTES],
    );
    if (rows.length > KNOWLEDGE_KEY_NORMALIZATION_LIMIT) {
      throw new KnowledgeKeyNormalizationRefused(
        'The inventory exceeds the bounded normalization window; use a reviewed offline migration.',
      );
    }
    const changes: { id: string; before: string; after: string }[] = [];
    const owners = new Map<string, string>();
    const conflicts = new Set<string>();
    const digest = createHash('sha256').update('project-knowledge-key-normalization-v1\n');
    let unresolved = 0;
    for (const row of rows) {
      const key = row.storage_uri === null ? null : objectKeyFromStorageUri(row.storage_uri);
      digest.update(JSON.stringify([row, key]));
      digest.update('\n');
      if (!key) {
        unresolved++;
        continue;
      }
      if (row.active) {
        const scope = JSON.stringify([row.user_id, row.organization_id]);
        const previous = owners.get(key);
        if (previous !== undefined && previous !== scope) conflicts.add(key);
        owners.set(key, scope);
      }
      if (key !== row.storage_uri)
        changes.push({ id: row.id, before: row.storage_uri!, after: key });
    }
    const report: KnowledgeKeyNormalizationReport = {
      review: digest.digest('hex'),
      references: rows.length,
      conversions: changes.length,
      unresolved,
      conflictingKeys: conflicts.size,
      ready: unresolved === 0 && conflicts.size === 0,
      applied: false,
    };
    if (input.review === undefined) return report;
    if (input.review !== report.review) {
      throw new KnowledgeKeyNormalizationRefused(
        'The reference inventory or configured storage mapping changed; review a fresh report.',
      );
    }
    if (!report.ready) {
      throw new KnowledgeKeyNormalizationRefused(
        'Unresolved references or conflicting owning scopes prevent normalization.',
      );
    }
    if (changes.length > 0) {
      const updated = await tx.query<{ id: string }>(
        `update public.project_knowledge_files f
            set storage_uri = changes.after
           from jsonb_to_recordset($1::jsonb) as changes(id uuid, before text, after text)
          where f.id = changes.id and f.storage_uri = changes.before
        returning f.id`,
        [JSON.stringify(changes)],
      );
      if (updated.length !== changes.length) {
        throw new KnowledgeKeyNormalizationRefused(
          'The reference rewrite did not cover its reviewed inventory.',
        );
      }
    }
    return { ...report, applied: true };
  });
}
