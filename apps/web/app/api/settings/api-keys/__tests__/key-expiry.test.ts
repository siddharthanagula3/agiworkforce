import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { table, neonQuery, neonExecute } = vi.hoisted(() => ({
  table: [] as Array<Record<string, unknown>>,
  neonQuery: vi.fn(),
  neonExecute: vi.fn(async () => 1),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: neonQuery, execute: neonExecute }),
}));

import {
  API_KEY_MAX_LIFETIME_DAYS_ENV,
  ApiKeyService,
  apiKeyExpiryProblem,
  apiKeyMaxLifetimeDays,
} from '@/lib/services/api-key-service';

const DAY_MS = 24 * 60 * 60 * 1000;

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Applies the predicates the statement itself carries, so a clause dropped from
 * the SQL stops filtering here too.
 */
function applyWhere(
  sql: string,
  params: readonly unknown[],
  rows: Array<Record<string, unknown>>,
  now: number,
): Array<Record<string, unknown>> {
  const lowered = sql.toLowerCase();
  const where = lowered.slice(lowered.indexOf('where')).replace(/\s+/g, ' ');
  return rows.filter((row) => {
    if (where.includes('key_prefix = $1') && row['key_prefix'] !== params[0]) return false;
    if (where.includes('revoked_at is null') && row['revoked_at'] !== null) return false;
    if (where.includes('(expires_at is null or expires_at > now())')) {
      const expiresAt = toText(row['expires_at']);
      if (expiresAt !== null && Date.parse(expiresAt) <= now) return false;
    }
    return true;
  });
}

/**
 * Writes the columns the statement names with the values it names, so a column
 * the statement fills with a literal lands as that literal here too.
 */
function applyInsert(sql: string, params: readonly unknown[]): Record<string, unknown> {
  const shape = /insert into api_keys \(([^)]*)\)\s*values\s*\(([^)]*)\)/i.exec(sql);
  if (!shape) throw new Error('The statement is not an insert into api_keys');

  const columns = shape[1]!.split(',').map((column) => column.trim());
  const values = shape[2]!.split(',').map((value) => value.trim());

  const row: Record<string, unknown> = {
    id: `key-${table.length + 1}`,
    last_used_at: null,
    revoked_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
  };
  columns.forEach((column, index) => {
    const value = values[index] ?? 'null';
    const placeholder = /^\$(\d+)$/.exec(value);
    row[column] = placeholder ? params[Number(placeholder[1]) - 1] : null;
  });
  row['expires_at'] = toText(row['expires_at']);
  return row;
}

const insertingDb = {
  query: async (sql: string, params: readonly unknown[]) => {
    const row = applyInsert(sql, params);
    table.push(row);
    return [row];
  },
  execute: async () => 1,
} as never;

async function issueKey(expiresAt: Date | null) {
  const { rawKey } = await ApiKeyService.createApiKey(
    insertingDb,
    'user-1',
    'CI key',
    ['models:read'],
    expiresAt,
  );
  return rawKey;
}

beforeEach(() => {
  table.length = 0;
  neonQuery.mockReset();
  neonQuery.mockImplementation(async (sql: string, params: readonly unknown[]) =>
    applyWhere(sql, params, table, Date.now()),
  );
});

afterEach(() => {
  delete process.env[API_KEY_MAX_LIFETIME_DAYS_ENV];
});

describe('an API key with an expiry', () => {
  it('is refused by verifyKey once the expiry has passed', async () => {
    const rawKey = await issueKey(new Date(Date.now() + DAY_MS));
    expect(await ApiKeyService.verifyKey(rawKey)).not.toBeNull();

    const stored = table[0]!;
    stored['expires_at'] = new Date(Date.now() - 1000).toISOString();

    expect(await ApiKeyService.verifyKey(rawKey)).toBeNull();
  }, 20000);

  it('records the expiry it was given rather than a null column', async () => {
    const expiresAt = new Date(Date.now() + 7 * DAY_MS);
    await issueKey(expiresAt);

    expect(table[0]?.['expires_at']).toBe(expiresAt.toISOString());
  }, 20000);
});

describe('an API key without an expiry', () => {
  it('is the default and still verifies after the maximum lifetime would have passed', async () => {
    const rawKey = await issueKey(null);

    expect(table[0]?.['expires_at']).toBeNull();

    const beyondTheMaximum = Date.now() + (apiKeyMaxLifetimeDays() + 1) * DAY_MS;
    neonQuery.mockImplementation(async (sql: string, params: readonly unknown[]) =>
      applyWhere(sql, params, table, beyondTheMaximum),
    );

    expect(await ApiKeyService.verifyKey(rawKey)).not.toBeNull();
  }, 20000);

  it('is still refused once it is revoked', async () => {
    const rawKey = await issueKey(null);
    table[0]!['revoked_at'] = new Date().toISOString();

    expect(await ApiKeyService.verifyKey(rawKey)).toBeNull();
  }, 20000);
});

describe('the expiry a caller may ask for', () => {
  it('refuses a time that has already passed', () => {
    const now = Date.now();
    expect(apiKeyExpiryProblem(new Date(now - 1000), now)).toBe('in_the_past');
    expect(apiKeyExpiryProblem(new Date(now), now)).toBe('in_the_past');
  });

  it('refuses a time beyond the configured maximum and accepts one inside it', () => {
    const now = Date.now();
    process.env[API_KEY_MAX_LIFETIME_DAYS_ENV] = '30';

    expect(apiKeyExpiryProblem(new Date(now + 31 * DAY_MS), now)).toBe('beyond_maximum');
    expect(apiKeyExpiryProblem(new Date(now + 29 * DAY_MS), now)).toBeNull();
  });

  it('moves the bound with the configuration rather than a constant in the code', () => {
    const now = Date.now();
    const wanted = new Date(now + 400 * DAY_MS);

    process.env[API_KEY_MAX_LIFETIME_DAYS_ENV] = '30';
    expect(apiKeyExpiryProblem(wanted, now)).toBe('beyond_maximum');

    process.env[API_KEY_MAX_LIFETIME_DAYS_ENV] = '500';
    expect(apiKeyExpiryProblem(wanted, now)).toBeNull();
  });

  it('falls back to the default maximum when the configured value is not a positive number', () => {
    const fallback = apiKeyMaxLifetimeDays();

    for (const value of ['', '   ', 'soon', '0', '-10']) {
      process.env[API_KEY_MAX_LIFETIME_DAYS_ENV] = value;
      expect(apiKeyMaxLifetimeDays()).toBe(fallback);
    }
  });

  it('refuses a time that is not a time at all', () => {
    expect(apiKeyExpiryProblem(new Date('not a date'), Date.now())).toBe('not_a_time');
  });

  it('is refused by creation itself, not only by the route that calls it', async () => {
    await expect(issueKey(new Date(Date.now() - DAY_MS))).rejects.toThrow(/future/i);
    expect(table).toHaveLength(0);
  }, 20000);
});
