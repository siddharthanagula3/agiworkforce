import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  organizationId: 'org-1' as string | null,
  region: { effective: 'us', provisioned: true, missing: [] as string[] },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-abc',
    organizationId: mocks.organizationId,
  })),
}));
vi.mock('@/lib/server/data-region', () => ({
  readOrganizationRegion: vi.fn(async () => ({
    effective: mocks.region.effective,
    requested: null,
    requestedAt: null,
    provisioned: mocks.region.provisioned,
    missing: mocks.region.missing,
  })),
}));

import { DATA_REGIONS } from '@agiworkforce/compliance';
import { SEARCH_SOURCE_KINDS } from '@agiworkforce/data-layer/search';

import { DELETE, GET, POST } from '@/app/api/search/route';

const REGION_IDS = Object.keys(DATA_REGIONS);

function chunkRow(kind: string, id: string) {
  return {
    chunk_id: `chunk-${id}`,
    document_id: `doc-${id}`,
    source_kind: kind,
    source_id: id,
    title: `Title ${id}`,
    content: `Quarterly content for ${id} with runway detail.`,
    start_offset: 0,
    end_offset: 40,
    metadata: {},
    chunk_version: 1,
    indexed_at: '2026-09-01T00:00:00.000Z',
    lexical_rank: '1',
    semantic_rank: null,
  };
}

function rowQueries(): Array<[string, unknown[]]> {
  return (mocks.query.mock.calls as Array<[string, unknown[]]>).filter(([sql]) =>
    /\bfrom\b|\bselect\s+\w+\(/i.test(sql),
  );
}

const originalRegion = process.env['AGI_DATA_REGION'];

beforeEach(() => {
  mocks.query.mockReset();
  mocks.organizationId = 'org-1';
  mocks.region = { effective: 'us', provisioned: true, missing: [] };
  process.env['AGI_DATA_REGION'] = 'us';
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes('from retrieval_chunks c') ? [chunkRow('artifact', 'a1')] : [],
  );
});

afterEach(() => {
  if (originalRegion === undefined) delete process.env['AGI_DATA_REGION'];
  else process.env['AGI_DATA_REGION'] = originalRegion;
});

describe('product search is served only from the workspace region', () => {
  it('answers from the home region and refuses every other, for every declared region', async () => {
    expect(REGION_IDS.length).toBeGreaterThan(1);
    for (const workspace of REGION_IDS) {
      for (const executing of REGION_IDS) {
        mocks.query.mockClear();
        mocks.region = { effective: workspace, provisioned: true, missing: [] };
        process.env['AGI_DATA_REGION'] = executing;

        const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
        const label = `${workspace} workspace on ${executing} deployment`;
        if (workspace === executing) {
          expect(response.status, label).toBe(200);
          expect(rowQueries().length, label).toBeGreaterThan(0);
        } else {
          expect(response.status, label).not.toBe(200);
          expect(rowQueries(), label).toEqual([]);
        }
      }
    }
  });

  it('refuses every region whose store is not provisioned, even its own deployment', async () => {
    for (const workspace of REGION_IDS) {
      mocks.query.mockClear();
      mocks.region = {
        effective: workspace,
        provisioned: false,
        missing: [`AGI_DATA_REGION_${workspace.toUpperCase()}_DATABASE_URL`],
      };
      process.env['AGI_DATA_REGION'] = workspace;

      const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
      expect(response.status, workspace).not.toBe(200);
      expect(rowQueries(), workspace).toEqual([]);
    }
  });

  it('names the region in the refusal without naming anything internal', async () => {
    mocks.region = { effective: 'eu', provisioned: true, missing: [] };
    process.env['AGI_DATA_REGION'] = 'us';
    const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    const message = body.error?.message ?? body.message ?? '';
    expect(message).toContain('eu');
    expect(message).not.toContain('DATABASE_URL');
    expect(message).not.toContain('postgres');
  });

  it('holds every method of the route to the same region, not only reads', async () => {
    mocks.region = { effective: 'eu', provisioned: true, missing: [] };
    process.env['AGI_DATA_REGION'] = 'us';

    for (const call of [
      () => GET(new NextRequest('http://localhost/api/search?q=quarterly')),
      () =>
        POST(
          new NextRequest('http://localhost/api/search', {
            method: 'POST',
            body: JSON.stringify({ query: 'quarterly', resultCount: 2 }),
            headers: { 'content-type': 'application/json' },
          }),
        ),
      () => DELETE(new NextRequest('http://localhost/api/search', { method: 'DELETE' })),
    ]) {
      mocks.query.mockClear();
      const response = await call();
      expect(response.status).not.toBe(200);
      expect(rowQueries()).toEqual([]);
    }
  });

  it('refuses a workspace whose pin cannot be read at all', async () => {
    mocks.region = { effective: '', provisioned: true, missing: [] };
    const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
    expect(response.status).not.toBe(200);
    expect(rowQueries()).toEqual([]);
  });
});

describe('every read product search makes is owner and workspace scoped', () => {
  const USER_PREDICATE = /\b(?:\w+\.)?user_id = \$1\b/;
  const WORKSPACE_PREDICATE = /\b(?:\w+\.)?organization_id is not distinct from \$(\d+)::uuid\b/;

  async function scopedCalls(url: string): Promise<Array<[string, unknown[]]>> {
    mocks.query.mockClear();
    await GET(new NextRequest(url));
    const calls = rowQueries();
    expect(calls.length).toBeGreaterThan(0);
    return calls;
  }

  it('carries the caller and the workspace on every statement it issues', async () => {
    const calls = await scopedCalls('http://localhost/api/search?q=quarterly');
    const unscoped: string[] = [];
    for (const [sql, params] of calls) {
      const routine = /^\s*select \* from (\w+)\(|^\s*select (\w+)\(/i.exec(sql);
      if (routine) {
        if (params[0] === 'user-abc' && params[1] === 'org-1') continue;
        unscoped.push(sql.trim().slice(0, 80));
        continue;
      }
      const workspace = WORKSPACE_PREDICATE.exec(sql);
      const bound = workspace ? params[Number(workspace[1]) - 1] : undefined;
      if (USER_PREDICATE.test(sql) && params[0] === 'user-abc' && bound === 'org-1') continue;
      unscoped.push(sql.trim().slice(0, 80));
    }
    expect(unscoped).toEqual([]);
  });

  it.each(['recent', 'popular', 'suggestions'])(
    'passes the caller and workspace to the %s routine rather than filtering after',
    async (type) => {
      const calls = await scopedCalls(`http://localhost/api/search?type=${type}&q=quarterly`);
      for (const [, params] of calls) {
        expect(params[0]).toBe('user-abc');
        expect(params[1]).toBe('org-1');
      }
    },
  );

  it('scopes the index the same way when no workspace is active', async () => {
    mocks.organizationId = null;
    const calls = await scopedCalls('http://localhost/api/search?q=quarterly');
    const index = calls.find(([sql]) => sql.includes('from retrieval_chunks c'));
    expect(index).toBeDefined();
    expect(index![1][0]).toBe('user-abc');
    expect(index![1][1]).toBeNull();
  });

  it('asks the index only for kinds the contract declares, whatever the caller sends', async () => {
    const calls = await scopedCalls(
      'http://localhost/api/search?q=quarterly&kind=artifact&kind=all&kind=../../etc',
    );
    const index = calls.find(([sql]) => sql.includes('from retrieval_chunks c'));
    expect(index![1][2]).toEqual(['artifact']);

    const everything = await scopedCalls('http://localhost/api/search?q=quarterly');
    const all = everything.find(([sql]) => sql.includes('from retrieval_chunks c'));
    expect(all![1][2]).toEqual([...SEARCH_SOURCE_KINDS]);
  });

  it('drops a stored row whose kind the contract no longer declares', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('from retrieval_chunks c')
        ? [chunkRow('artifact', 'a1'), chunkRow('connector_object', 'x1')]
        : [],
    );
    const response = await GET(new NextRequest('http://localhost/api/search?q=quarterly'));
    const body = (await response.json()) as { documents: Array<{ sourceId: string }> };
    expect(body.documents.map((document) => document.sourceId)).toEqual(['a1']);
  });
});

describe('what a search result hands the surface that renders it', () => {
  const CONVERSATION = '11111111-1111-4111-8111-111111111111';
  const MESSAGE = '22222222-2222-4222-8222-222222222222';
  const PROJECT = '33333333-3333-4333-8333-333333333333';
  const FILE = '44444444-4444-4444-8444-444444444444';
  const WHEN = '2026-09-01T00:00:00.000Z';

  beforeEach(() => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from web_conversations'))
        return [{ id: CONVERSATION, title: 'Runway plan', created_at: WHEN, updated_at: WHEN }];
      if (sql.includes('from user_projects'))
        return [
          {
            id: PROJECT,
            name: 'Runway model',
            description: 'the runway spreadsheet',
            created_at: WHEN,
            updated_at: WHEN,
          },
        ];
      if (sql.includes('from media_assets'))
        return [
          {
            id: FILE,
            kind: 'file',
            prompt: 'runway chart',
            metadata: { filename: 'runway.csv' },
            created_at: WHEN,
          },
        ];
      if (sql.includes('from web_messages'))
        return [
          {
            id: MESSAGE,
            conversation_id: CONVERSATION,
            role: 'assistant',
            content: 'Our runway is eleven months at the current burn.',
            created_at: WHEN,
            updated_at: WHEN,
            session_title: 'Runway plan',
          },
        ];
      if (sql.includes('from retrieval_chunks c')) return [chunkRow('artifact', 'a1')];
      return [];
    });
  });

  async function families(): Promise<Array<{ family: string; row: Record<string, unknown> }>> {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, Array<Record<string, unknown>>>;
    const out: Array<{ family: string; row: Record<string, unknown> }> = [];
    for (const family of ['results', 'projects', 'files', 'documents']) {
      const rows = body[family] ?? [];
      expect(rows.length, `${family} returned nothing to assert on`).toBeGreaterThan(0);
      for (const row of rows) out.push({ family, row });
    }
    return out;
  }

  it('names the kind of every result it returns', async () => {
    for (const { family, row } of await families()) {
      const kind = row['type'] ?? row['sourceKind'];
      expect(typeof kind, family).toBe('string');
      expect(String(kind).length, family).toBeGreaterThan(0);
    }
  });

  it('gives every result a title, a dated stamp and somewhere to open', async () => {
    for (const { family, row } of await families()) {
      const title = row['sessionTitle'] ?? row['projectName'] ?? row['fileName'] ?? row['title'];
      expect(typeof title, `${family} title`).toBe('string');
      expect(String(title).trim().length, `${family} title`).toBeGreaterThan(0);

      const when = row['updatedAt'] ?? row['createdAt'] ?? row['indexedAt'];
      expect(Number.isNaN(Date.parse(String(when))), `${family} date`).toBe(false);

      const target = row['href'] ?? row['newChatHref'];
      expect(typeof target, `${family} open target`).toBe('string');
      expect(String(target).startsWith('/'), `${family} open target`).toBe(true);
    }
  });

  it('marks the matched passage so a reader can see why a result matched', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    const body = (await response.json()) as {
      results: Array<Record<string, string>>;
      projects: Array<Record<string, string>>;
      files: Array<Record<string, string>>;
      documents: Array<Record<string, string>>;
    };
    for (const row of [...body.results, ...body.projects, ...body.files]) {
      expect(row['matchedText']?.toLowerCase()).toContain('runway');
      expect(typeof row['contextBefore']).toBe('string');
      expect(typeof row['contextAfter']).toBe('string');
    }
    for (const document of body.documents) {
      expect(document['snippet']?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('attaches the project a project result belongs to', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    const body = (await response.json()) as {
      projects: Array<{ projectId: string; projectName: string }>;
    };
    expect(body.projects[0]!.projectId).toBe(PROJECT);
    expect(body.projects[0]!.projectName).toBe('Runway model');
  });

  it('keeps a recent-search list the surface can offer before anything is typed', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('get_recent_searches')
        ? [{ query: 'runway', result_count: 3, created_at: WHEN }]
        : [],
    );
    const response = await GET(new NextRequest('http://localhost/api/search?type=recent'));
    const body = (await response.json()) as { searches: Array<{ query: string }> };
    expect(body.searches.map((search) => search.query)).toEqual(['runway']);
  });

  it('counts each family so a surface can say how much it found', async () => {
    const response = await GET(new NextRequest('http://localhost/api/search?q=runway'));
    const body = (await response.json()) as {
      stats: Record<string, number>;
      modes: Record<string, string>;
      strategy: string;
    };
    for (const key of [
      'totalResults',
      'sessionMatches',
      'messageMatches',
      'projectMatches',
      'fileMatches',
      'documentMatches',
    ]) {
      expect(typeof body.stats[key], key).toBe('number');
    }
    expect(body.modes).toEqual({ rows: 'product', documents: 'private_knowledge' });
    expect(body.strategy).toBe('hybrid');
  });
});
