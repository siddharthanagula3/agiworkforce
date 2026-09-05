import { describe, expect, it } from 'vitest';

import { resolveInternalUserId, subjectIsStoredUserId } from '../identities';

function reader(rows: Array<{ user_id: string }>, seen: unknown[][] = []) {
  return {
    query: async <Row>(sql: string, params?: readonly unknown[]): Promise<Row[]> => {
      seen.push([sql, params]);
      return rows as Row[];
    },
  };
}

describe('internal user id resolution', () => {
  it('returns a clerk subject unchanged without touching the database', async () => {
    const seen: unknown[][] = [];
    await expect(resolveInternalUserId(reader([], seen), 'clerk', 'user_1')).resolves.toBe(
      'user_1',
    );
    expect(seen).toHaveLength(0);
    expect(subjectIsStoredUserId('clerk')).toBe(true);
  });

  it('reads the mapping row for a provider whose subjects are not stored ids', async () => {
    const seen: unknown[][] = [];
    await expect(
      resolveInternalUserId(reader([{ user_id: 'user_1' }], seen), 'auth0', 'auth0|abc'),
    ).resolves.toBe('user_1');
    expect(seen[0]?.[1]).toEqual(['auth0', 'auth0|abc']);
    expect(subjectIsStoredUserId('auth0')).toBe(false);
  });

  it('reports an unmapped subject as unknown rather than inventing an id', async () => {
    await expect(resolveInternalUserId(reader([]), 'auth0', 'auth0|abc')).resolves.toBeNull();
  });
});
