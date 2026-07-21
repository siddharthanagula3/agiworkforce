import { describe, it, expect } from 'vitest';
import { withIsoTimestamps } from '../iso-timestamps';

describe('withIsoTimestamps', () => {
  it('converts Date timestamp columns to ISO strings (fixes conversations/[id] ZodError)', () => {
    // The driver returns timestamptz as JS Date; the wire schema wants ISO strings.
    const d = new Date('2026-07-21T22:00:00.000Z');
    const rows = withIsoTimestamps([
      { id: 'm1', created_at: d, updated_at: d, deleted_at: null, content: 'hi' },
    ]);
    const row = rows[0] as Record<string, unknown>;
    expect(row.created_at).toBe('2026-07-21T22:00:00.000Z');
    expect(row.updated_at).toBe('2026-07-21T22:00:00.000Z');
    expect(row.deleted_at).toBeNull();
    expect(row.content).toBe('hi'); // non-timestamp fields untouched
  });

  it('leaves already-string timestamps and empty input untouched', () => {
    expect(withIsoTimestamps([])).toEqual([]);
    const rows = withIsoTimestamps([{ created_at: '2026-07-21T22:00:00.000Z' }]);
    expect((rows[0] as Record<string, unknown>).created_at).toBe('2026-07-21T22:00:00.000Z');
  });
});
