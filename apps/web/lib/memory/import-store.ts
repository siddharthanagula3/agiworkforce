import 'server-only';

import { createHash } from 'node:crypto';
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

function deterministicImportedMemoryId(
  userId: string,
  source: string,
  normalizedKey: string,
): string {
  const hex = createHash('sha256')
    .update(`agi-imported-memory-v1\0${userId}\0${source}\0${normalizedKey}`)
    .digest('hex')
    .slice(0, 32);
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const uuidHex = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
}

export async function persistImportedMemories(
  db: ImportMemoryDb,
  params: { userId: string; items: readonly string[]; source: string },
): Promise<PersistImportedMemoriesResult> {
  const seen = new Set<string>();
  const batch: Array<{ id: string; content: string }> = [];
  for (const raw of params.items) {
    const content = clampImportItemLength(raw.trim());
    if (!content) continue;
    const normalizedKey = normalizeMemoryKey(content);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    batch.push({
      id: deterministicImportedMemoryId(params.userId, params.source, normalizedKey),
      content,
    });
  }
  if (batch.length === 0) {
    return { memories: [], insertedCount: 0, skippedDuplicateCount: 0 };
  }

  const inserted = await db.query<ImportedMemoryRow>(
    `with incoming as materialized (
       select item ->> 'id' as id,
              item ->> 'content' as content
         from jsonb_array_elements($2::jsonb) as source(item)
     )
     insert into user_memories (id, user_id, content, source)
     select incoming.id::uuid, $1, incoming.content, $3
       from incoming
     on conflict (id) do nothing
     returning id::text as id, content, category, source, pinned, created_at, updated_at`,
    [params.userId, JSON.stringify(batch), params.source],
  );

  return {
    memories: inserted,
    insertedCount: inserted.length,
    skippedDuplicateCount: batch.length - inserted.length,
  };
}
