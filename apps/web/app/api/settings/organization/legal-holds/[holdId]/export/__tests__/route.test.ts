import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveCaller: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/compliance-caller', () => ({
  resolveComplianceCaller: mocks.resolveCaller,
}));

import { GET } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const HOLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function holdRow(
  scope: 'organization' | 'member' | 'custodian',
  subject: string | null,
  over: Record<string, unknown> = {},
) {
  return {
    id: HOLD,
    organization_id: ORG,
    name: 'Matter 9',
    reason: null,
    scope,
    subject_user_id: subject,
    resource_types: null,
    custodian_user_ids: [],
    created_by_user_id: 'admin',
    released_at: null,
    released_by_user_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function call(holdId = HOLD, search = '') {
  const url = `https://app.test/api/x/${holdId}/export${search}`;
  return GET(new Request(url) as never, { params: Promise.resolve({ holdId }) });
}

async function lines(res: Response): Promise<Array<Record<string, unknown>>> {
  return (await res.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const custodyInserts: unknown[][] = [];

function sourceQuery(sql: string): boolean {
  return /from public\.(web_conversations c|web_messages|user_projects p|project_knowledge_files|media_assets|web_artifacts|cloud_agent_runs)/.test(
    sql,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  custodyInserts.length = 0;
  mocks.resolveCaller.mockResolvedValue({
    kind: 'admin_api_key',
    actorUserId: 'admin_api_key:key-1',
    organizationId: ORG,
    role: 'admin_api_key',
  });
});

function harness(hold: Record<string, unknown>, rows: (sql: string) => Record<string, unknown>[]) {
  const seen: Array<{ sql: string; params: unknown[] }> = [];
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/insert into public\.ediscovery_exports/.test(sql)) {
      custodyInserts.push(params);
      return [{ id: 'export-1' }];
    }
    if (/select entry_hash from public\.ediscovery_exports/.test(sql)) return [];
    if (/from public\.legal_holds/.test(sql)) return [hold];
    seen.push({ sql, params });
    return rows(sql);
  });
  return seen;
}

describe('GET legal hold eDiscovery export', () => {
  it('streams the held member records, then a manifest whose checksum matches the bytes', async () => {
    harness(holdRow('member', 'held-user'), (sql) => {
      if (/from public\.web_conversations c/.test(sql)) {
        return [{ id: 'c1', user_id: 'held-user', title: 'Deal', created_at: '2026-01-01' }];
      }
      if (/from public\.web_messages/.test(sql)) {
        return [
          {
            id: 'm1',
            conversation_id: 'c1',
            role: 'user',
            content: 'hi',
            created_at: '2026-01-01',
          },
        ];
      }
      return [];
    });

    const res = await call();
    const body = await res.text();
    const parsed = body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/ndjson/);
    expect(parsed.map((line) => line['type'])).toEqual([
      'hold',
      'conversation',
      'message',
      'manifest',
      'custody',
    ]);

    const manifestLine = parsed[3] as { data: Record<string, unknown> };
    const manifest = manifestLine.data as {
      records: number;
      bytes: number;
      sha256: string;
      entries: Array<{ resourceType: string; records: number; sha256: string }>;
    };

    // The digest has to cover exactly the record bytes the caller received, so
    // it is recomputed here from the delivered file minus its two trailer lines.
    const recordBytes = body
      .split('\n')
      .slice(0, 3)
      .map((line) => line + '\n')
      .join('');
    expect(manifest.sha256).toBe(createHash('sha256').update(recordBytes).digest('hex'));
    expect(manifest.bytes).toBe(Buffer.byteLength(recordBytes));
    expect(manifest.records).toBe(3);
    expect(manifest.entries.map((entry) => entry.resourceType)).toEqual([
      'hold',
      'conversation',
      'message',
    ]);

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'ediscovery_export', severity: 'critical' }),
    );
  });

  it('writes one chain-of-custody record naming the exporter, the filter and the digest', async () => {
    harness(holdRow('member', 'held-user'), () => []);

    const res = await call(HOLD, '?resourceTypes=conversation&from=2026-01-01T00:00:00Z');
    const parsed = await lines(res);

    expect(custodyInserts).toHaveLength(1);
    const params = custodyInserts[0] as unknown[];
    expect(params[0]).toBe(ORG);
    expect(params[1]).toBe(HOLD);
    expect(params[3]).toBe('admin_api_key:key-1');
    expect(JSON.parse(String(params[5]))).toEqual({
      resourceTypes: ['conversation'],
      custodianUserIds: null,
      from: '2026-01-01T00:00:00Z',
      to: null,
    });
    expect(params[10]).toBe('completed');
    expect(String(params[9])).toMatch(/^[0-9a-f]{64}$/);

    const custody = parsed[parsed.length - 1] as { data: Record<string, unknown> };
    expect(custody.data['id']).toBe('export-1');
    expect(String(custody.data['entryHash'])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exports the whole workspace for an organization-wide hold', async () => {
    const seen = harness(holdRow('organization', null), () => []);

    await (await call()).text();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((entry) => entry.params[1] === null)).toBe(true);
  });

  it('reads only the stores the filter names', async () => {
    const seen = harness(holdRow('organization', null), () => []);

    await (await call(HOLD, '?resourceTypes=conversation,file')).text();

    const tables = seen.map((entry) => (sourceQuery(entry.sql) ? entry.sql : '')).filter(Boolean);
    expect(tables).toHaveLength(2);
    expect(tables.some((sql) => /web_conversations/.test(sql))).toBe(true);
    expect(tables.some((sql) => /media_assets/.test(sql))).toBe(true);
  });

  it('passes the date window to every source', async () => {
    const seen = harness(holdRow('organization', null), () => []);

    await (await call(HOLD, '?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z')).text();

    expect(seen.length).toBeGreaterThan(0);
    for (const entry of seen) {
      expect(entry.params[5]).toBe('2026-01-01T00:00:00Z');
      expect(entry.params[6]).toBe('2026-02-01T00:00:00Z');
    }
  });

  it('narrows a custodian filter to the people the hold actually preserves', async () => {
    const seen = harness(
      holdRow('custodian', null, { custodian_user_ids: ['alice', 'bob'] }),
      () => [],
    );

    await (await call(HOLD, '?custodians=bob,mallory')).text();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]?.params[1]).toEqual(['bob']);
  });

  it('exports nothing when the custodian filter names nobody the hold holds', async () => {
    const seen = harness(holdRow('custodian', null, { custodian_user_ids: ['alice'] }), () => []);

    const parsed = await lines(await call(HOLD, '?custodians=mallory'));

    expect(seen.filter((entry) => sourceQuery(entry.sql))).toHaveLength(0);
    expect(parsed.map((line) => line['type'])).toEqual(['hold', 'manifest', 'custody']);
  });

  it('refuses a store the hold does not preserve', async () => {
    const seen = harness(
      holdRow('organization', null, { resource_types: ['conversation'] }),
      () => [],
    );

    await (await call(HOLD, '?resourceTypes=file')).text();

    expect(seen.filter((entry) => sourceQuery(entry.sql))).toHaveLength(0);
  });

  it('rejects a window that ends before it starts', async () => {
    harness(holdRow('organization', null), () => []);

    const res = await call(HOLD, '?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z');

    expect(res.status).toBe(400);
    expect(mocks.resolveCaller).not.toHaveBeenCalled();
  });

  it('answers 404 for a hold in another workspace and exports nothing', async () => {
    mocks.query.mockResolvedValue([]);

    const res = await call();

    expect(res.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('rejects a malformed hold id before authorizing', async () => {
    const res = await call('nope');

    expect(res.status).toBe(400);
    expect(mocks.resolveCaller).not.toHaveBeenCalled();
  });
});
