
import { getDb } from './db';
import type { MemoryFact } from './types';

function row2fact(r: Record<string, unknown>): MemoryFact {
  return {
    id: r.id as string,
    fact: r.fact as string,
    source_conversation_id: (r.source_conversation_id as string | null) ?? null,
    pinned: !!(r.pinned as number),
    created_at: r.created_at as number,
  };
}

export async function insertMemoryFact(
  fact: Omit<MemoryFact, 'pinned'> & { pinned?: boolean },
  embedding?: Float32Array,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO memory_facts (id, fact, source_conversation_id, pinned, created_at)
       VALUES (?, ?, ?, ?, ?);`,
      [
        fact.id,
        fact.fact,
        fact.source_conversation_id ?? null,
        fact.pinned ? 1 : 0,
        fact.created_at,
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
}): Promise<MemoryFact[]> {
  const db = await getDb();
  const limit = opts?.limit ?? 100;
  if (opts?.pinned !== undefined) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM memory_facts WHERE pinned = ? ORDER BY created_at DESC LIMIT ?;',
      [opts.pinned ? 1 : 0, limit],
    );
    return rows.map(row2fact);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM memory_facts ORDER BY pinned DESC, created_at DESC LIMIT ?;',
    [limit],
  );
  return rows.map(row2fact);
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
  await db.runAsync('UPDATE memory_facts SET fact = ? WHERE id = ?;', [fact, id]);
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
    "SELECT * FROM memory_facts WHERE lower(fact) LIKE ? ESCAPE '\\' ORDER BY pinned DESC, created_at DESC LIMIT ?;",
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
