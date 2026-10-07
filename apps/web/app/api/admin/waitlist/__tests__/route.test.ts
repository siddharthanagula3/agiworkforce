import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type RateLimitModule = typeof import('@/lib/rate-limit');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type ErrorsModule = typeof import('@/lib/errors');

vi.mock('server-only', () => ({}));

const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@/lib/logger', async (importOriginal) => {
  const record = (...args: unknown[]) => {
    logged.calls.push(args);
  };
  return {
    ...(await importOriginal<LoggerModule>()),
    logger: { info: record, warn: record, error: record, debug: record },
  };
});

const rateLimit = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: async (_request: unknown, key: string) => {
    rateLimit.keys.push(key);
    return null;
  },
}));

const audit = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  storeFailure: null as Error | null,
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  logSecurityEvent: async (event: Record<string, unknown>, options?: { required?: boolean }) => {
    if (audit.storeFailure) {
      if (options?.required) throw audit.storeFailure;
      return;
    }
    audit.events.push(event);
  },
  getClientIp: () => '203.0.113.7',
}));

const auth = vi.hoisted(() => ({ user: null as { userId: string } | null }));

vi.mock('@/lib/api-auth', async () => {
  const { createError } = await vi.importActual<ErrorsModule>('@/lib/errors');
  return {
    isAccountUnavailableError: vi.fn(),
    assertAccountActive: async () => undefined,
    getClerkAuthUser: async () => {
      if (!auth.user) throw createError.unauthorized();
      return auth.user;
    },
    getOptionalAuthUser: vi.fn(),
    getSuspendedAccountUser: vi.fn(),
    getClerkAuthorizedParties: vi.fn(),
  };
});

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  publicRows: [] as Array<Record<string, unknown>>,
  upgradeRows: [] as Array<Record<string, unknown>>,
  consentRows: [] as Array<Record<string, unknown>>,
}));

function pageOf(rows: Row[], params: unknown[]): Row[] {
  const [limit, sortValue, id] = params as [number, string | undefined, string | undefined];
  const keyed = rows.map((row) => ({
    key: `${String(row['page_sort_key'])}${String(row['id'])}`,
    row,
  }));
  keyed.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  const after = sortValue ? keyed.filter(({ key }) => key < `${sortValue}${String(id)}`) : keyed;
  return after.slice(0, limit).map(({ row }) => row);
}

function countBy(rows: Row[], column: string): Row[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[column]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count }));
}

function answer(sql: string, params: unknown[]): Row[] {
  if (sql.includes('consent_records')) {
    const [subjects, purposes] = params as [string[], string[]];
    const column = sql.includes('user_id = any') ? 'user_id' : 'subject_email_sha256';
    return db.consentRows
      .filter(
        (row) =>
          subjects.includes(String(row[column])) && purposes.includes(String(row['purpose'])),
      )
      .map((row) => ({ ...row, subject: row[column] }));
  }
  if (sql.includes('public.cloud_managed_waitlist')) {
    return sql.includes('group by source')
      ? countBy(db.publicRows, 'source')
      : pageOf(db.publicRows, params);
  }
  if (sql.includes('public.waitlist')) {
    return sql.includes('group by plan')
      ? countBy(db.upgradeRows, 'plan')
      : pageOf(db.upgradeRows, params);
  }
  throw new Error(`Unexpected statement: ${sql}`);
}

vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => ({
    query: async (sql: string, params: unknown[] = []) => {
      db.queries.push({ sql, params });
      return answer(sql, params);
    },
    execute: async (sql: string, params: unknown[] = []) => {
      db.queries.push({ sql, params });
      return 0;
    },
  }),
}));

import { NextRequest } from 'next/server';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';
import { WAITLIST_EXPORT_ROW_LIMIT } from '@/features/admin/services/operator-waitlist';
import { MAX_PAGE_SIZE } from '@/lib/identity/pagination';
import { hashConsentSubjectEmail } from '@/lib/server/consent-records';
import { EMAIL_HASH_PEPPER_ENV, legacyEmailSha256 } from '@/lib/server/email-pseudonym';
import { GET as listGet } from '../route';
import { GET as exportGet } from '../export/route';

const OPERATOR_ID = 'user_platform_operator_1';
const CUSTOMER_ID = 'user_customer_1';
const NEWEST = 'ada@example.invalid';
const OLDER = 'grace@example.invalid';
const LEGACY = 'legacy@example.invalid';
const FORMULA_ADDRESSES = [
  "=cmd|'/c_calc'!a1@example.invalid",
  '+plus@example.invalid',
  '-dash@example.invalid',
  '@at@example.invalid',
];
const ADDRESSES = [NEWEST, OLDER, LEGACY, ...FORMULA_ADDRESSES];

const originalAllowlist = process.env[PLATFORM_ADMIN_ENV_VAR];
const originalPepper = process.env[EMAIL_HASH_PEPPER_ENV];

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function publicRow(index: number, email: string, source: string, joinedAt: string): Row {
  return {
    id: uuid(index),
    email,
    source,
    user_id: null,
    joined_at: joinedAt,
    page_sort_key: joinedAt.replace('Z', '000Z'),
  };
}

function consentRow(subject: string, purpose: string, granted: boolean, recordedAt: string): Row {
  return {
    user_id: null,
    subject_email_sha256: subject,
    purpose,
    granted,
    notice_version: '2026-08-11',
    surface: 'web-waitlist-inline',
    recorded_at: recordedAt,
  };
}

function accountConsentRow(
  userId: string,
  purpose: string,
  granted: boolean,
  recordedAt: string,
): Row {
  return {
    ...consentRow('', purpose, granted, recordedAt),
    user_id: userId,
    subject_email_sha256: null,
  };
}

function manyPublicRows(count: number): Row[] {
  const first = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, index) =>
    publicRow(
      index + 1_000,
      `bulk-${index}@example.invalid`,
      'website',
      new Date(first + index * 60_000).toISOString(),
    ),
  );
}

async function exportedLines(): Promise<string[]> {
  const response = await exportGet(get('/api/admin/waitlist/export'));
  return (await response.text()).trimEnd().split('\n').slice(1);
}

function get(path: string): NextRequest {
  return new NextRequest(`https://app.agiworkforce.test${path}`);
}

function everythingWritten(): string {
  return JSON.stringify({ audit: audit.events, logged: logged.calls });
}

beforeEach(() => {
  process.env[PLATFORM_ADMIN_ENV_VAR] = OPERATOR_ID;
  process.env[EMAIL_HASH_PEPPER_ENV] = 'test-pepper-for-the-waitlist-operator-view';
  auth.user = { userId: OPERATOR_ID };
  audit.events.length = 0;
  audit.storeFailure = null;
  logged.calls.length = 0;
  rateLimit.keys.length = 0;
  db.queries.length = 0;
  db.publicRows = [
    publicRow(1, OLDER, 'website', '2026-10-01T09:00:00.000Z'),
    publicRow(2, NEWEST, 'mobile', '2026-10-03T09:00:00.000Z'),
    publicRow(3, LEGACY, 'mobile', '2026-09-01T09:00:00.000Z'),
  ];
  db.upgradeRows = [
    {
      id: uuid(50),
      user_id: 'user_upgrade_1',
      email: 'pseudonym-of-an-address',
      plan: 'pro',
      joined_at: '2026-10-02T09:00:00.000Z',
      page_sort_key: '2026-10-02T09:00:00.000000Z',
    },
  ];
  db.consentRows = [
    consentRow(
      hashConsentSubjectEmail(NEWEST),
      'platform_availability_waitlist',
      true,
      '2026-10-03T09:00:00.000Z',
    ),
    consentRow(
      hashConsentSubjectEmail(NEWEST),
      'product_updates',
      false,
      '2026-10-03T09:00:00.000Z',
    ),
    consentRow(
      legacyEmailSha256(LEGACY),
      'platform_availability_waitlist',
      true,
      '2026-09-01T09:00:00.000Z',
    ),
  ];
});

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env[PLATFORM_ADMIN_ENV_VAR];
  else process.env[PLATFORM_ADMIN_ENV_VAR] = originalAllowlist;
  if (originalPepper === undefined) delete process.env[EMAIL_HASH_PEPPER_ENV];
  else process.env[EMAIL_HASH_PEPPER_ENV] = originalPepper;
});

const READS = [
  { name: 'the public list', call: () => listGet(get('/api/admin/waitlist')) },
  { name: 'the upgrade list', call: () => listGet(get('/api/admin/waitlist?list=upgrade')) },
  { name: 'the export', call: () => exportGet(get('/api/admin/waitlist/export')) },
];

describe('the operator waitlist view admits only a platform admin', () => {
  it.each(READS)('refuses a signed-out caller for $name, with no data', async ({ call }) => {
    auth.user = null;

    const response = await call();
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    for (const address of ADDRESSES) expect(body).not.toContain(address);
    expect(db.queries).toEqual([]);
    expect(audit.events).toEqual([]);
  });

  it.each(READS)(
    'refuses a signed-in caller who is not a platform admin for $name, with no data',
    async ({ call }) => {
      auth.user = { userId: CUSTOMER_ID };

      const response = await call();
      const body = await response.text();

      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      for (const address of ADDRESSES) expect(body).not.toContain(address);
      expect(db.queries).toEqual([]);
      expect(audit.events).toEqual([]);
    },
  );

  it.each(READS)('is rate limited as an operator read for $name', async ({ call }) => {
    await call();

    expect(rateLimit.keys).toEqual(['admin-operator']);
  });

  it.each(READS)(
    'serves nothing for $name when its audit entry cannot be written',
    async ({ call }) => {
      audit.storeFailure = new Error('security_audit_logs is unreachable');

      const response = await call();
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).not.toContain('text/csv');
      expect(response.headers.get('Content-Disposition')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      for (const address of ADDRESSES) expect(body).not.toContain(address);
      expect(body).not.toContain('user_upgrade_1');
      expect(audit.events).toEqual([]);
    },
  );
});

describe('GET /api/admin/waitlist', () => {
  it('lists public entries newest first with the total and a count per source', async () => {
    const response = await listGet(get('/api/admin/waitlist'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.list).toBe('public');
    expect(body.total).toBe(3);
    expect(body.bySource).toEqual(
      expect.arrayContaining([
        { key: 'mobile', count: 2 },
        { key: 'website', count: 1 },
      ]),
    );
    expect(body.entries.map((entry: { email: string }) => entry.email)).toEqual([
      NEWEST,
      OLDER,
      LEGACY,
    ]);
    expect(body.entries[0]).toMatchObject({
      source: 'mobile',
      joinedAt: '2026-10-03T09:00:00.000Z',
    });
    const page = db.queries.find(({ sql }) => sql.includes('order by page_sort_key desc, id desc'));
    expect(page?.sql).toContain('public.cloud_managed_waitlist');
  });

  it('attaches the consent decisions, found under the hash the public route writes', async () => {
    const body = await (await listGet(get('/api/admin/waitlist'))).json();
    const [newest, older, legacy] = body.entries;

    expect(newest.consent).toEqual([
      expect.objectContaining({ purpose: 'platform_availability_waitlist', granted: true }),
      expect.objectContaining({ purpose: 'product_updates', granted: false }),
    ]);
    expect(older.consent).toEqual([]);
    expect(legacy.consent).toEqual([
      expect.objectContaining({ purpose: 'platform_availability_waitlist', granted: true }),
    ]);
    const lookup = db.queries.find(({ sql }) => sql.includes('consent_records'));
    expect(lookup?.params[0]).toContain(hashConsentSubjectEmail(NEWEST));
    expect(JSON.stringify(lookup?.params)).not.toContain(NEWEST);
  });

  it('bounds the page size and pages by cursor without repeating a row', async () => {
    const first = await (await listGet(get('/api/admin/waitlist?limit=1000000'))).json();
    const pageQuery = db.queries.find(({ sql }) => sql.includes('limit $1'));
    expect(pageQuery?.params[0]).toBe(MAX_PAGE_SIZE + 1);
    expect(first.hasMore).toBe(false);

    const one = await (await listGet(get('/api/admin/waitlist?limit=1'))).json();
    expect(one.entries.map((entry: { email: string }) => entry.email)).toEqual([NEWEST]);
    expect(one.hasMore).toBe(true);

    const next = await (
      await listGet(get(`/api/admin/waitlist?limit=1&cursor=${encodeURIComponent(one.nextCursor)}`))
    ).json();
    expect(next.entries.map((entry: { email: string }) => entry.email)).toEqual([OLDER]);
  });

  it('refuses a cursor it did not issue', async () => {
    const response = await listGet(get('/api/admin/waitlist?cursor=not-a-cursor'));

    expect(response.status).toBe(400);
    expect(db.queries).toEqual([]);
  });

  it('writes an audit event naming the admin and the count, never an address', async () => {
    await listGet(get('/api/admin/waitlist'));

    expect(audit.events).toEqual([
      expect.objectContaining({
        userId: OPERATOR_ID,
        eventType: 'admin_action',
        endpoint: '/api/admin/waitlist',
        details: { action: 'waitlist_read', list: 'public', count: 3, total: 3 },
      }),
    ]);
    for (const address of ADDRESSES) expect(everythingWritten()).not.toContain(address);
  });

  it('lists the upgrade waitlist by account and plan, without its pseudonymous email column', async () => {
    const response = await listGet(get('/api/admin/waitlist?list=upgrade'));
    const body = await response.json();

    expect(body).toMatchObject({
      list: 'upgrade',
      total: 1,
      byPlan: [{ key: 'pro', count: 1 }],
      entries: [{ userId: 'user_upgrade_1', plan: 'pro', joinedAt: '2026-10-02T09:00:00.000Z' }],
    });
    expect(JSON.stringify(body)).not.toContain('pseudonym-of-an-address');
    expect(Object.keys(body.entries[0])).not.toContain('email');
    expect(audit.events[0]?.['details']).toEqual({
      action: 'waitlist_read',
      list: 'upgrade',
      count: 1,
      total: 1,
    });
  });
});

describe('the consent on record is the newest decision', () => {
  const EARLIER = '2026-09-20T09:00:00.000Z';
  const LATER = '2026-09-28T09:00:00.000Z';
  const WITHDREW = 'withdrew@example.invalid';
  const REKEYED = 'rekeyed@example.invalid';
  const MIRRORED = 'mirrored@example.invalid';
  const MEMBER = 'member@example.invalid';
  const MEMBER_ID = 'user_member_1';

  beforeEach(() => {
    db.publicRows = [
      publicRow(20, WITHDREW, 'mobile', '2026-10-04T09:00:00.000Z'),
      publicRow(21, REKEYED, 'mobile', '2026-10-03T09:00:00.000Z'),
      publicRow(22, MIRRORED, 'other', '2026-10-02T09:00:00.000Z'),
      { ...publicRow(23, MEMBER, 'website', '2026-10-01T09:00:00.000Z'), user_id: MEMBER_ID },
    ];
    db.consentRows = [
      consentRow(hashConsentSubjectEmail(WITHDREW), 'platform_availability_waitlist', false, LATER),
      consentRow(
        hashConsentSubjectEmail(WITHDREW),
        'platform_availability_waitlist',
        true,
        EARLIER,
      ),
      consentRow(hashConsentSubjectEmail(WITHDREW), 'product_updates', true, EARLIER),
      consentRow(hashConsentSubjectEmail(WITHDREW), 'product_updates', false, LATER),
      consentRow(legacyEmailSha256(REKEYED), 'platform_availability_waitlist', true, EARLIER),
      consentRow(hashConsentSubjectEmail(REKEYED), 'platform_availability_waitlist', false, LATER),
      consentRow(
        hashConsentSubjectEmail(MIRRORED),
        'platform_availability_waitlist',
        true,
        EARLIER,
      ),
      consentRow(legacyEmailSha256(MIRRORED), 'platform_availability_waitlist', false, LATER),
      consentRow(hashConsentSubjectEmail(MEMBER), 'product_updates', true, EARLIER),
      accountConsentRow(MEMBER_ID, 'product_updates', false, LATER),
      accountConsentRow(MEMBER_ID, 'enterprise_waitlist', true, EARLIER),
    ];
  });

  async function consentFor(address: string): Promise<unknown> {
    const body = await (await listGet(get('/api/admin/waitlist'))).json();
    return body.entries.find((entry: { email: string }) => entry.email === address).consent;
  }

  const refusal = (purpose: string) =>
    expect.objectContaining({ purpose, granted: false, recordedAt: LATER });

  it('shows a withdrawal, whichever of the grant and the refusal the store answers with first', async () => {
    expect(await consentFor(WITHDREW)).toEqual([
      refusal('platform_availability_waitlist'),
      refusal('product_updates'),
    ]);
  });

  it.each([
    { address: REKEYED, older: 'the legacy digest', newer: 'the keyed hash' },
    { address: MIRRORED, older: 'the keyed hash', newer: 'the legacy digest' },
  ])(
    'prefers a refusal under $newer to an older grant under $older of the same address',
    async ({ address }) => {
      expect(await consentFor(address)).toEqual([refusal('platform_availability_waitlist')]);
    },
  );

  it('reads a decision recorded under the account, and prefers it when it is the newer one', async () => {
    expect(await consentFor(MEMBER)).toEqual([
      expect.objectContaining({
        purpose: 'enterprise_waitlist',
        granted: true,
        recordedAt: EARLIER,
      }),
      refusal('product_updates'),
    ]);
  });

  it('writes the same decisions to the CSV', async () => {
    expect(await exportedLines()).toEqual([
      `${WITHDREW},mobile,2026-10-04T09:00:00.000Z,,not granted,not granted`,
      `${REKEYED},mobile,2026-10-03T09:00:00.000Z,,,not granted`,
      `${MIRRORED},other,2026-10-02T09:00:00.000Z,,,not granted`,
      `${MEMBER},website,2026-10-01T09:00:00.000Z,granted,not granted,`,
    ]);
  });

  it('asks the store for the newest row of each subject and purpose', async () => {
    await listGet(get('/api/admin/waitlist'));

    const lookups = db.queries
      .filter(({ sql }) => sql.includes('consent_records'))
      .map(({ sql }) => sql.replace(/\s+/g, ' ').trim());

    expect(lookups).toHaveLength(2);
    expect(lookups[0]).toMatch(
      /^select distinct on \(subject_email_sha256, purpose\) .* order by subject_email_sha256, purpose, recorded_at desc$/,
    );
    expect(lookups[1]).toMatch(
      /^select distinct on \(user_id, purpose\) .* order by user_id, purpose, recorded_at desc$/,
    );
  });
});

describe('a decision recorded under another list is not shown as consent for this one', () => {
  const EARLY_MOBILE = 'early-mobile@example.invalid';

  beforeEach(() => {
    db.publicRows = [publicRow(40, EARLY_MOBILE, 'mobile', '2026-09-15T09:00:00.000Z')];
    db.consentRows = [
      consentRow(
        hashConsentSubjectEmail(EARLY_MOBILE),
        'enterprise_waitlist',
        true,
        '2026-09-15T09:00:00.000Z',
      ),
      consentRow(
        hashConsentSubjectEmail(EARLY_MOBILE),
        'product_updates',
        true,
        '2026-09-15T09:00:00.000Z',
      ),
    ];
  });

  it('leaves a mobile row that agreed to the Enterprise notice without a platform availability decision', async () => {
    const body = await (await listGet(get('/api/admin/waitlist'))).json();

    expect(body.entries[0].consent).toEqual([
      expect.objectContaining({ purpose: 'product_updates', granted: true }),
    ]);
    expect(await exportedLines()).toEqual([
      `${EARLY_MOBILE},mobile,2026-09-15T09:00:00.000Z,,granted,`,
    ]);
  });
});

describe('GET /api/admin/waitlist/export', () => {
  it('exports every public entry as CSV with its consent decisions', async () => {
    const response = await exportGet(get('/api/admin/waitlist/export'));
    const lines = (await response.text()).trimEnd().split('\n');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="waitlist-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(lines[0]).toBe(
      'email,source,joined_at,enterprise_waitlist,product_updates,platform_availability_waitlist',
    );
    expect(lines.slice(1)).toEqual([
      `${NEWEST},mobile,2026-10-03T09:00:00.000Z,,not granted,granted`,
      `${OLDER},website,2026-10-01T09:00:00.000Z,,,`,
      `${LEGACY},mobile,2026-09-01T09:00:00.000Z,,,granted`,
    ]);
  });

  it('neutralises a cell a spreadsheet would run as a formula', async () => {
    db.publicRows = FORMULA_ADDRESSES.map((address, index) =>
      publicRow(index + 10, address, 'website', `2026-10-0${index + 1}T09:00:00.000Z`),
    );

    const lines = (await (await exportGet(get('/api/admin/waitlist/export'))).text())
      .trimEnd()
      .split('\n')
      .slice(1);

    expect(lines).toHaveLength(FORMULA_ADDRESSES.length);
    for (const line of lines) expect(line).toMatch(/^'[=+\-@]/);
    for (const address of FORMULA_ADDRESSES) {
      expect(lines.some((line) => line.startsWith(`'${address},`))).toBe(true);
    }
  });

  it('quotes an address that carries a comma or a double quote, so it stays one cell', async () => {
    db.publicRows = [
      publicRow(30, '"a,b"@example.invalid', 'website', '2026-10-02T09:00:00.000Z'),
      publicRow(31, '=1,2@example.invalid', 'website', '2026-10-01T09:00:00.000Z'),
    ];

    expect(await exportedLines()).toEqual([
      '"""a,b""@example.invalid",website,2026-10-02T09:00:00.000Z,,,',
      `"'=1,2@example.invalid",website,2026-10-01T09:00:00.000Z,,,`,
    ]);
  });

  it('reads a long list in more than one batch, with every row once and newest first', async () => {
    const rows = manyPublicRows(WAITLIST_EXPORT_ROW_LIMIT / 4);
    db.publicRows = rows;

    const lines = await exportedLines();

    const batches = db.queries.filter(
      ({ sql }) => sql.includes('public.cloud_managed_waitlist') && sql.includes('limit $1'),
    );
    expect(batches.length).toBeGreaterThan(1);
    expect(lines.map((line) => line.split(',')[0])).toEqual(
      rows.map((row) => row['email']).reverse(),
    );
    expect(audit.events[0]?.['details']).toMatchObject({
      count: rows.length,
      total: rows.length,
      truncated: false,
    });
  });

  it('stops at the row limit, keeps the newest rows, and records that it was cut short', async () => {
    const rows = manyPublicRows(WAITLIST_EXPORT_ROW_LIMIT + 1);
    db.publicRows = rows;

    const lines = await exportedLines();

    expect(lines.map((line) => line.split(',')[0])).toEqual(
      rows
        .slice(1)
        .map((row) => row['email'])
        .reverse(),
    );
    expect(audit.events[0]?.['details']).toEqual({
      action: 'waitlist_export',
      list: 'public',
      count: WAITLIST_EXPORT_ROW_LIMIT,
      total: WAITLIST_EXPORT_ROW_LIMIT + 1,
      truncated: true,
    });
  });

  it('does not call an export that holds every row cut short', async () => {
    db.publicRows = manyPublicRows(WAITLIST_EXPORT_ROW_LIMIT);

    const lines = await exportedLines();

    expect(lines).toHaveLength(WAITLIST_EXPORT_ROW_LIMIT);
    expect(audit.events[0]?.['details']).toMatchObject({
      count: WAITLIST_EXPORT_ROW_LIMIT,
      total: WAITLIST_EXPORT_ROW_LIMIT,
      truncated: false,
    });
  });

  it('writes an audit event naming the admin and the count, never an address', async () => {
    await exportGet(get('/api/admin/waitlist/export'));

    expect(audit.events).toEqual([
      expect.objectContaining({
        userId: OPERATOR_ID,
        eventType: 'admin_action',
        endpoint: '/api/admin/waitlist/export',
        details: {
          action: 'waitlist_export',
          list: 'public',
          count: 3,
          total: 3,
          truncated: false,
        },
      }),
    ]);
    for (const address of ADDRESSES) expect(everythingWritten()).not.toContain(address);
  });
});
