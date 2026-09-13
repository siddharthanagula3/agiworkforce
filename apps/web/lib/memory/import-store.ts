import 'server-only';

import { clampImportItemLength, normalizeMemoryKey } from './import-parser';

export interface ImportMemoryDb {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ImportedMemoryRow {
  id: string;
  content: string;
  category: string | null;
  source: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersistImportedMemoriesResult {
  memories: ImportedMemoryRow[];
  insertedCount: number;
  skippedDuplicateCount: number;
}

export async function persistImportedMemories(
  db: ImportMemoryDb,
  params: { userId: string; items: readonly string[]; source: string },
): Promise<PersistImportedMemoriesResult> {
  const seen = new Set<string>();
  const batch: Array<{ content: string; importKey: string }> = [];
  for (const raw of params.items) {
    const content = clampImportItemLength(raw.trim());
    if (!content) continue;
    const importKey = normalizeMemoryKey(content);
    if (!importKey || seen.has(importKey)) continue;
    seen.add(importKey);
    batch.push({ content, importKey });
  }
  if (batch.length === 0) {
    return { memories: [], insertedCount: 0, skippedDuplicateCount: 0 };
  }

  // The row id is the column default, a random uuid, and never a value the
  // caller supplies or anyone can derive. Migration 0189 moved dedupe onto
  // import_key, unique per (user_id, source), so a repeat import is still
  // skipped without a global key another tenant could occupy or probe.
  const inserted = await db.query<ImportedMemoryRow>(
    `with incoming as materialized (
       select item ->> 'content' as content,
              item ->> 'importKey' as import_key
         from jsonb_array_elements($2::jsonb) as source(item)
     )
     insert into user_memories (user_id, content, source, import_key)
     select $1, incoming.content, $3, incoming.import_key
       from incoming
     on conflict (user_id, source, import_key) where import_key is not null do nothing
     returning id::text as id, content, category, source, pinned, created_at, updated_at`,
    [params.userId, JSON.stringify(batch), params.source],
  );

  return {
    memories: inserted,
    insertedCount: inserted.length,
    skippedDuplicateCount: batch.length - inserted.length,
  };
}
