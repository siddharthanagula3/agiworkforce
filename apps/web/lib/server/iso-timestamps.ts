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

export function toIsoTimestamp(value: string | Date | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}
