/**
 * node-postgres / the Neon driver return `timestamptz` columns as JS `Date`,
 * but the wire schemas (and the JSON the client receives) require ISO strings.
 * A non-empty result therefore fails `schema.parse` with
 * "Invalid input: expected string, received Date" (empty results have no Date
 * to reject — hence the intermittency). Normalize the timestamp columns before
 * validating/serializing.
 *
 * Shared by /api/chat/sync and /api/chat/conversations/[id] (and any route that
 * validates raw DB rows against a wire schema with string timestamps).
 */
export function withIsoTimestamps<T>(rows: T[]): T[] {
  return rows.map((row) => {
    const out = { ...(row as Record<string, unknown>) };
    for (const key of ['created_at', 'updated_at', 'deleted_at'] as const) {
      const value = out[key];
      if (value instanceof Date) out[key] = value.toISOString();
    }
    return out as T;
  });
}
