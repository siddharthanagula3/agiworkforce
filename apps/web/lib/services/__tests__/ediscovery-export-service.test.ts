import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { HOLDABLE_RESOURCES } from '@agiworkforce/types';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  EDISCOVERY_GENESIS_HASH,
  EdiscoveryManifestBuilder,
  UNFILTERED_EXPORT,
  ediscoveryCustodyHash,
  exportSourceTable,
  exportedCustodians,
  exportedResourceTypes,
  iterateLegalHoldExport,
  recordEdiscoveryExport,
  unexportableResourceTypes,
  type EdiscoveryCustodyInput,
  type EdiscoveryFilter,
} from '../ediscovery-export-service';
import { LEGAL_HOLD_RESOURCE_TYPES, type LegalHold } from '../retention-service';

const ORG = '11111111-1111-4111-8111-111111111111';

function hold(over: Partial<LegalHold> = {}): LegalHold {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: ORG,
    name: 'Matter 41',
    reason: null,
    scope: 'organization',
    subjectUserId: null,
    custodianUserIds: [],
    resourceTypes: null,
    createdByUserId: 'user-admin',
    releasedAt: null,
    releasedByUserId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function filter(over: Partial<EdiscoveryFilter> = {}): EdiscoveryFilter {
  return { ...UNFILTERED_EXPORT, ...over };
}

const TABLES: Array<[RegExp, string]> = [
  [/from public\.web_conversations c\s+where/, 'conversation'],
  [/from public\.web_messages/, 'message'],
  [/from public\.user_projects p\s+where/, 'project'],
  [/from public\.project_knowledge_files/, 'project_file'],
  [/from public\.media_assets/, 'file'],
  [/from public\.web_artifacts/, 'artifact'],
  [/from public\.cloud_agent_runs/, 'work_run'],
];

/** The alias each source gives its own table, as the SQL spells it. */
function sqlAlias(table: string): string {
  return (
    { project_knowledge_files: 'k', media_assets: 'f', cloud_agent_runs: 'r' }[table] ??
    table.replace(/^(web|user)_/u, '')[0]!
  );
}

function readHarness(rows: Record<string, Record<string, unknown>[]> = {}) {
  const reads: Array<{ resourceType: string; params: unknown[]; sql: string }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const resourceType = TABLES.find(([re]) => re.test(String(sql)))?.[1];
    if (!resourceType) return [];
    reads.push({ resourceType, params, sql: String(sql) });
    return rows[resourceType] ?? [];
  });
  return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, reads };
}

async function drain(
  db: DatabaseAdapter,
  subject: LegalHold,
  active: EdiscoveryFilter,
): Promise<Array<{ resourceType: string; records: number }>> {
  const chunks: Array<{ resourceType: string; records: number }> = [];
  for await (const chunk of iterateLegalHoldExport(db, subject, active)) {
    chunks.push({ resourceType: chunk.resourceType, records: chunk.records.length });
  }
  return chunks;
}

describe('export scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has a source for every store a hold can name', () => {
    expect(unexportableResourceTypes()).toEqual([]);
    for (const resource of HOLDABLE_RESOURCES) {
      expect(
        exportSourceTable(resource.resourceType as (typeof LEGAL_HOLD_RESOURCE_TYPES)[number]),
        `the export reads no table for ${resource.resourceType}`,
      ).toBe(resource.table);
    }
  });

  it('marks a held row whose bytes live outside this product as a reference', async () => {
    const h = readHarness({
      file: [
        { id: 'a1', created_at: '2026-08-02T00:00:00.000Z', content_preserved: true },
        { id: 'a2', created_at: '2026-08-03T00:00:00.000Z', content_preserved: false },
      ],
    });

    const chunks: Array<{ resourceType: string; referenceOnly: number }> = [];
    for await (const chunk of iterateLegalHoldExport(
      h.db,
      hold(),
      filter({ resourceTypes: ['file'] }),
    )) {
      chunks.push({ resourceType: chunk.resourceType, referenceOnly: chunk.referenceOnly });
    }

    expect(chunks).toContainEqual({ resourceType: 'file', referenceOnly: 1 });
  });

  it('asks the database which rows it actually holds the bytes for', async () => {
    const h = readHarness();
    await drain(h.db, hold(), filter());

    for (const resource of HOLDABLE_RESOURCES) {
      const sql = h.reads.find((read) => read.resourceType === resource.resourceType)?.sql ?? '';
      expect(sql, `${resource.resourceType} is never read`).toContain('as content_preserved');
      if (resource.storedContentColumn === null) continue;
      expect(sql, `${resource.resourceType} reports every row as preserved content`).toContain(
        `(${sqlAlias(resource.table)}.${resource.storedContentColumn} is not null)`,
      );
    }
  });

  it('reads only the stores the filter names', async () => {
    const h = readHarness();
    await drain(h.db, hold(), filter({ resourceTypes: ['conversation', 'file'] }));

    expect(h.reads.map((read) => read.resourceType)).toEqual(['conversation', 'file']);
  });

  it('cannot reach past the hold to a store the hold does not preserve', async () => {
    const h = readHarness();
    const narrowed = hold({ resourceTypes: ['conversation'] });
    await drain(h.db, narrowed, filter({ resourceTypes: ['file'] }));

    expect(h.reads).toEqual([]);
    expect(exportedResourceTypes(narrowed, filter({ resourceTypes: ['file'] }))).toEqual([]);
  });

  it('intersects a custodian filter with the people the hold preserves', async () => {
    const h = readHarness();
    const custodial = hold({ scope: 'custodian', custodianUserIds: ['ann', 'bo'] });
    await drain(h.db, custodial, filter({ custodianUserIds: ['bo', 'mallory'] }));

    expect(h.reads[0]?.params[1]).toEqual(['bo']);
  });

  it('exports nothing when the custodian filter names nobody the hold holds', async () => {
    const h = readHarness();
    const custodial = hold({ scope: 'custodian', custodianUserIds: ['ann'] });
    const chunks = await drain(h.db, custodial, filter({ custodianUserIds: ['mallory'] }));

    expect(h.reads).toEqual([]);
    expect(chunks.map((chunk) => chunk.resourceType)).toEqual(['hold']);
  });

  it('exports the whole workspace only when the hold covers everyone', async () => {
    expect(exportedCustodians(hold(), UNFILTERED_EXPORT)).toBeNull();
    expect(
      exportedCustodians(hold({ scope: 'member', subjectUserId: 'ann' }), UNFILTERED_EXPORT),
    ).toEqual(['ann']);
  });

  it('passes the same date window to every store it reads', async () => {
    const h = readHarness();
    await drain(h.db, hold(), filter({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' }));

    expect(h.reads).toHaveLength(TABLES.length);
    for (const read of h.reads) {
      expect(read.params[5]).toBe('2026-01-01T00:00:00Z');
      expect(read.params[6]).toBe('2026-02-01T00:00:00Z');
    }
  });

  it('pages a store until it is drained', async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({
      id: `c${index}`,
      created_at: '2026-01-01T00:00:00.000Z',
    }));
    const h = readHarness({ conversation: page });
    let calls = 0;
    (h.db.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if (!/from public\.web_conversations c\s+where/.test(String(sql))) return [];
      calls += 1;
      return calls === 1 ? page : [];
    });

    const chunks = await drain(h.db, hold(), filter({ resourceTypes: ['conversation'] }));
    expect(chunks.map((chunk) => chunk.records)).toEqual([1, 500]);
  });
});

describe('manifest', () => {
  it('checksums the bytes that left the process, per store and for the whole file', () => {
    const builder = new EdiscoveryManifestBuilder(hold(), UNFILTERED_EXPORT);
    const first = new TextEncoder().encode('{"type":"hold"}\n');
    const second = new TextEncoder().encode('{"type":"conversation","data":{}}\n');
    builder.add('hold', 1, first);
    builder.add('conversation', 2, second);

    const manifest = builder.build('2026-09-18T00:00:00.000Z');

    expect(manifest.records).toBe(3);
    expect(manifest.bytes).toBe(first.byteLength + second.byteLength);
    expect(manifest.sha256).toBe(createHash('sha256').update(first).update(second).digest('hex'));
    expect(manifest.entries).toContainEqual({
      resourceType: 'hold',
      records: 1,
      bytes: first.byteLength,
      referenceOnly: 0,
      sha256: createHash('sha256').update(first).digest('hex'),
    });
    expect(manifest.entries).toContainEqual({
      resourceType: 'conversation',
      records: 2,
      bytes: second.byteLength,
      referenceOnly: 0,
      sha256: createHash('sha256').update(second).digest('hex'),
    });
  });

  it('states a zero for a store in scope that produced nothing', () => {
    const manifest = new EdiscoveryManifestBuilder(hold(), UNFILTERED_EXPORT).build(
      '2026-09-18T00:00:00.000Z',
    );

    expect(manifest.entries.map((entry) => entry.resourceType)).toEqual([
      'hold',
      ...LEGAL_HOLD_RESOURCE_TYPES,
    ]);
    for (const entry of manifest.entries) {
      expect(entry.records, `${entry.resourceType} claims records nothing produced`).toBe(0);
    }
  });

  it('counts a held row whose bytes this product never stored as a reference', () => {
    const builder = new EdiscoveryManifestBuilder(hold(), UNFILTERED_EXPORT);
    builder.add('file', 3, new TextEncoder().encode('{"type":"file"}\n'), 2);

    const manifest = builder.build('2026-09-18T00:00:00.000Z');

    expect(manifest.referenceOnly).toBe(2);
    expect(manifest.entries.find((entry) => entry.resourceType === 'file')?.referenceOnly).toBe(2);
  });

  it('can be built twice without the digest changing under it', () => {
    const builder = new EdiscoveryManifestBuilder(hold(), UNFILTERED_EXPORT);
    builder.add('hold', 1, new TextEncoder().encode('{"type":"hold"}\n'));

    expect(builder.build('2026-09-18T00:00:00.000Z').sha256).toBe(
      builder.build('2026-09-18T00:00:01.000Z').sha256,
    );
  });

  it('names the stores and people the export actually covered, not the ones asked for', () => {
    const narrowed = hold({ scope: 'custodian', custodianUserIds: ['ann', 'bo'] });
    const active = filter({ resourceTypes: ['conversation'], custodianUserIds: ['bo'] });
    const manifest = new EdiscoveryManifestBuilder(narrowed, active).build(
      '2026-09-18T00:00:00.000Z',
    );

    expect(manifest.resourceTypes).toEqual(['conversation']);
    expect(manifest.custodianUserIds).toEqual(['bo']);
    expect(manifest.holdId).toBe(narrowed.id);
  });
});

describe('chain of custody', () => {
  beforeEach(() => vi.clearAllMocks());

  function custodyInput(over: Partial<EdiscoveryCustodyInput> = {}): EdiscoveryCustodyInput {
    return {
      organizationId: ORG,
      holdId: hold().id,
      holdName: 'Matter 41',
      requestedByUserId: 'user-admin',
      requestedVia: 'session',
      filter: UNFILTERED_EXPORT,
      manifest: new EdiscoveryManifestBuilder(hold(), UNFILTERED_EXPORT).build(
        '2026-09-18T00:00:00.000Z',
      ),
      outcome: 'completed',
      error: null,
      startedAt: '2026-09-18T00:00:00.000Z',
      completedAt: '2026-09-18T00:00:01.000Z',
      ...over,
    };
  }

  function custodyHarness(previous: string | null) {
    const inserts: unknown[][] = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/insert into public\.ediscovery_exports/.test(String(sql))) {
        inserts.push(params);
        return [{ id: 'export-1' }];
      }
      return previous === null ? [] : [{ entry_hash: previous }];
    });
    return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, inserts };
  }

  it('starts the chain at the genesis hash for a workspace that never exported', async () => {
    const h = custodyHarness(null);
    const record = await recordEdiscoveryExport(h.db, custodyInput());

    expect(record.previousHash).toBe(EDISCOVERY_GENESIS_HASH);
    expect(record.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.inserts[0]?.[14]).toBe(EDISCOVERY_GENESIS_HASH);
    expect(h.inserts[0]?.[15]).toBe(record.entryHash);
  });

  it('links each export to the last one this workspace made', async () => {
    const earlier = 'f'.repeat(64);
    const h = custodyHarness(earlier);
    const record = await recordEdiscoveryExport(h.db, custodyInput());

    expect(record.previousHash).toBe(earlier);
    expect(record.entryHash).toBe(ediscoveryCustodyHash(earlier, custodyInput()));
  });

  it('breaks the link when any recorded field is altered', () => {
    const base = custodyInput();
    const original = ediscoveryCustodyHash(EDISCOVERY_GENESIS_HASH, base);

    expect(
      ediscoveryCustodyHash(EDISCOVERY_GENESIS_HASH, {
        ...base,
        requestedByUserId: 'somebody-else',
      }),
    ).not.toBe(original);
    expect(
      ediscoveryCustodyHash(EDISCOVERY_GENESIS_HASH, {
        ...base,
        filter: filter({ resourceTypes: ['conversation'] }),
      }),
    ).not.toBe(original);
    expect(ediscoveryCustodyHash('a'.repeat(64), base)).not.toBe(original);
  });

  it('records a failed export with its reason and no content digest to vouch for', async () => {
    const h = custodyHarness(null);
    const record = await recordEdiscoveryExport(
      h.db,
      custodyInput({ manifest: null, outcome: 'failed', error: 'connection reset' }),
    );

    expect(record.records).toBe(0);
    expect(record.contentDigest).toBe(EDISCOVERY_GENESIS_HASH);
    expect(h.inserts[0]?.[10]).toBe('failed');
    expect(h.inserts[0]?.[11]).toBe('connection reset');
  });

  it('writes the manifest and the filter that produced the export', async () => {
    const h = custodyHarness(null);
    const active = filter({ resourceTypes: ['conversation'], from: '2026-01-01T00:00:00Z' });
    await recordEdiscoveryExport(h.db, custodyInput({ filter: active }));

    expect(JSON.parse(String(h.inserts[0]?.[5]))).toEqual(active);
    expect(JSON.parse(String(h.inserts[0]?.[6]))).toMatchObject({ holdId: hold().id });
  });
});
