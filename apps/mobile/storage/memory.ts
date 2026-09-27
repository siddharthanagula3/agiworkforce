import { getDb } from './db';
import type { MemoryFact, MemoryFactSource, ReplacedMemoryFact } from './types';

const MEMORY_FACT_SOURCES: ReadonlySet<string> = new Set<MemoryFactSource>([
  'typed',
  'learned',
  'imported',
]);

function row2fact(r: Record<string, unknown>): MemoryFact {
  return {
    id: r.id as string,
    fact: r.fact as string,
    source_conversation_id: (r.source_conversation_id as string | null) ?? null,
    pinned: !!(r.pinned as number),
    created_at: r.created_at as number,
    updated_at: typeof r.updated_at === 'number' ? r.updated_at : (r.created_at as number),
    source:
      typeof r.source === 'string' && MEMORY_FACT_SOURCES.has(r.source)
        ? (r.source as MemoryFactSource)
        : null,
    superseded_by: typeof r.superseded_by === 'string' ? r.superseded_by : null,
  };
}

function prefixedRow(row: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}

export async function insertMemoryFact(
  fact: Omit<MemoryFact, 'pinned'> & { pinned?: boolean },
  embedding?: Float32Array,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO memory_facts (id, fact, source_conversation_id, pinned, created_at, updated_at, source, superseded_by, superseded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        fact.id,
        fact.fact,
        fact.source_conversation_id ?? null,
        fact.pinned ? 1 : 0,
        fact.created_at,
        fact.updated_at ?? fact.created_at,
        fact.source ?? null,
        fact.superseded_by ?? null,
        fact.superseded_by ? fact.created_at : null,
      ],
    );
    if (embedding) {
      try {
        await db.runAsync('INSERT INTO memory_vectors (fact_id, embedding) VALUES (?, ?);', [
          fact.id,
          embedding as unknown as string,
        ]);
      } catch {
        // sqlite-vec not available.
      }
    }
  });
}

export async function listMemoryFacts(opts?: {
  pinned?: boolean;
  limit?: number;
  includeReplaced?: boolean;
}): Promise<MemoryFact[]> {
  const db = await getDb();
  const limit = opts?.limit ?? 100;
  const active = opts?.includeReplaced ? '' : 'superseded_by IS NULL';
  if (opts?.pinned !== undefined) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM memory_facts WHERE pinned = ?${active ? ` AND ${active}` : ''} ORDER BY created_at DESC LIMIT ?;`,
      [opts.pinned ? 1 : 0, limit],
    );
    return rows.map(row2fact);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM memory_facts${active ? ` WHERE ${active}` : ''} ORDER BY pinned DESC, created_at DESC LIMIT ?;`,
    [limit],
  );
  return rows.map(row2fact);
}

export async function supersedeMemoryFacts(ids: readonly string[], keptId: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync(
        'UPDATE memory_facts SET superseded_by = ?, superseded_at = ? WHERE id = ? AND superseded_by IS NULL;',
        [keptId, now, id],
      );
    }
  });
}

export async function listReplacedMemoryFacts(limit = 50): Promise<ReplacedMemoryFact[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT replaced.id AS r_id, replaced.fact AS r_fact, replaced.source_conversation_id AS r_source_conversation_id,
            replaced.pinned AS r_pinned, replaced.created_at AS r_created_at, replaced.updated_at AS r_updated_at,
            replaced.source AS r_source, replaced.superseded_by AS r_superseded_by,
            kept.id AS k_id, kept.fact AS k_fact, kept.source_conversation_id AS k_source_conversation_id,
            kept.pinned AS k_pinned, kept.created_at AS k_created_at, kept.updated_at AS k_updated_at,
            kept.source AS k_source, kept.superseded_by AS k_superseded_by
       FROM memory_facts replaced
       JOIN memory_facts kept ON kept.id = replaced.superseded_by
      WHERE kept.superseded_by IS NULL
      ORDER BY replaced.superseded_at DESC
      LIMIT ?;`,
    [limit],
  );
  return rows.map((row) => ({
    replaced: row2fact(prefixedRow(row, 'r_')),
    kept: row2fact(prefixedRow(row, 'k_')),
  }));
}

export async function restoreReplacedMemoryFact(replacedId: string): Promise<boolean> {
  const db = await getDb();
  let restored = false;
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ superseded_by: string | null }>(
      'SELECT superseded_by FROM memory_facts WHERE id = ?;',
      [replacedId],
    );
    const keptId = row?.superseded_by;
    if (!keptId) return;
    const now = Date.now();
    await db.runAsync(
      'UPDATE memory_facts SET superseded_by = NULL, superseded_at = NULL, updated_at = ? WHERE id = ?;',
      [now, replacedId],
    );
    await db.runAsync(
      'UPDATE memory_facts SET superseded_by = ?, superseded_at = ?, updated_at = ? WHERE id = ?;',
      [replacedId, now, now, keptId],
    );
    restored = true;
  });
  return restored;
}

export async function getMemoryFact(id: string): Promise<MemoryFact | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM memory_facts WHERE id = ?;',
    [id],
  );
  return r ? row2fact(r) : null;
}

export async function deleteMemoryFact(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM memory_facts WHERE id = ?;', [id]);
    try {
      await db.runAsync('DELETE FROM memory_vectors WHERE fact_id = ?;', [id]);
    } catch {
      // sqlite-vec table may not exist.
    }
  });
}

export async function deleteAllMemoryFacts(): Promise<number> {
  const db = await getDb();
  let deleted = 0;
  await db.withTransactionAsync(async () => {
    deleted = (await db.runAsync('DELETE FROM memory_facts;')).changes;
    await db.runAsync('DELETE FROM memory_vectors;').catch(() => undefined);
  });
  return deleted;
}

export async function searchMemoryByEmbedding(
  queryEmbedding: Float32Array,
  k = 10,
): Promise<string[]> {
  const db = await getDb();
  try {
    const rows = await db.getAllAsync<{ fact_id: string }>(
      `SELECT fact_id FROM memory_vectors
       WHERE embedding MATCH ?
       ORDER BY distance LIMIT ?;`,
      [queryEmbedding as unknown as string, k],
    );
    return rows.map((r: { fact_id: string }) => r.fact_id);
  } catch {
    return [];
  }
}

export async function updateMemoryFact(id: string, fact: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE memory_facts SET fact = ?, updated_at = ? WHERE id = ?;', [
    fact,
    Date.now(),
    id,
  ]);
}

export async function togglePinMemoryFact(id: string, pinned: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE memory_facts SET pinned = ? WHERE id = ?;', [pinned ? 1 : 0, id]);
}

export async function searchMemoryByText(query: string, k = 10): Promise<MemoryFact[]> {
  const db = await getDb();
  const escaped = query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
  const q = `%${escaped}%`;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM memory_facts WHERE lower(fact) LIKE ? ESCAPE '\\' AND superseded_by IS NULL ORDER BY pinned DESC, created_at DESC LIMIT ?;",
    [q, k],
  );
  return rows.map(row2fact);
}

export async function updateEmbedding(factId: string, embedding: Float32Array): Promise<void> {
  const db = await getDb();
  try {
    await db.runAsync('INSERT OR REPLACE INTO memory_vectors (fact_id, embedding) VALUES (?, ?);', [
      factId,
      embedding as unknown as string,
    ]);
  } catch {
    // sqlite-vec not available.
  }
}
