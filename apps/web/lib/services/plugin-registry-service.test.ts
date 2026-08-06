import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PLUGIN_REGISTRY_MAX_LIMIT,
  PluginRegistryDataError,
  getPluginRegistryEntry,
  listPluginRegistryEntries,
} from './plugin-registry-service';

const DIGEST = 'b'.repeat(64);

const ROW = {
  id: 'github-automation',
  name: 'GitHub Automation',
  version: '1.0.0',
  description: 'Automate pull request reviews.',
  category: 'Developer',
  publisher_id: 'agi',
  publisher_name: 'AGI',
  publisher_kind: 'first-party',
  publisher_url: null,
  source: 'builtin',
  status: 'preview',
  declared_skills: ['Code Review', 'Issue Summarizer'],
  required_connectors: ['github'],
  capabilities: ['connectors', 'network'],
  permissions: [],
  versions: [],
  manifest: null,
  manifest_url: null,
  sha256: null,
  signature: null,
  signature_algorithm: null,
  homepage_url: null,
  created_at: '2026-08-05T00:00:00.000Z',
  updated_at: '2026-08-05T00:00:00.000Z',
  total_count: '1',
};

function database(rows: unknown[] = [ROW]): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  const db = {
    query: vi.fn().mockResolvedValue(rows),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  };
  return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

describe('listPluginRegistryEntries', () => {
  let db: ReturnType<typeof database>;

  beforeEach(() => {
    db = database();
  });

  it('maps a row onto the PluginRegistryEntry contract', async () => {
    const result = await listPluginRegistryEntries(db);
    expect(result.total).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      id: 'github-automation',
      version: '1.0.0',
      status: 'preview',
      source: 'builtin',
      declaredSkills: ['Code Review', 'Issue Summarizer'],
      requiredConnectors: ['github'],
      capabilities: ['connectors', 'network'],
      distribution: null,
      publisher: { id: 'agi', name: 'AGI', kind: 'first-party' },
      integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    });
  });

  it('passes null filters when none are supplied', async () => {
    await listPluginRegistryEntries(db);
    const params = db.query.mock.calls[0]?.[1];
    expect(params?.slice(0, 3)).toEqual([null, null, null]);
  });

  it('binds exact filters as parameters, never string-interpolated SQL', async () => {
    await listPluginRegistryEntries(db, {
      category: ' Developer ',
      status: 'published',
      source: 'marketplace',
    });
    const [sql, params] = db.query.mock.calls[0] ?? [];
    expect(params?.slice(0, 3)).toEqual(['Developer', 'published', 'marketplace']);
    expect(String(sql)).not.toContain('Developer');
  });

  it('drops a filter value that is not in the contract union', async () => {
    await listPluginRegistryEntries(db, {
      status: 'installed' as never,
      source: 'hosted' as never,
    });
    const params = db.query.mock.calls[0]?.[1];
    expect(params?.slice(1, 3)).toEqual([null, null]);
  });

  it('clamps limit to the ceiling and floors a negative offset', async () => {
    await listPluginRegistryEntries(db, { limit: 5_000, offset: -10 });
    const params = db.query.mock.calls[0]?.[1];
    expect(params?.[3]).toBe(PLUGIN_REGISTRY_MAX_LIMIT);
    expect(params?.[4]).toBe(0);
  });

  it('coerces a fractional limit to a whole page size of at least one', async () => {
    await listPluginRegistryEntries(db, { limit: 0.5 });
    expect(db.query.mock.calls[0]?.[1]?.[3]).toBe(1);
  });

  it('returns an empty catalogue rather than throwing when nothing matches', async () => {
    const empty = database([]);
    await expect(listPluginRegistryEntries(empty)).resolves.toEqual({ entries: [], total: 0 });
  });

  it('omits a malformed row instead of serving it or failing the catalogue', async () => {
    const mixed = database([
      { ...ROW, id: '../evil', total_count: '2' },
      { ...ROW, id: 'crm-sync', total_count: '2' },
    ]);
    const result = await listPluginRegistryEntries(mixed);
    expect(result.entries.map((entry) => entry.id)).toEqual(['crm-sync']);
    expect(result.total).toBe(2);
  });

  it('drops capability strings that are not in the contract union', async () => {
    const rogue = database([{ ...ROW, capabilities: ['network', 'root', 42] }]);
    const result = await listPluginRegistryEntries(rogue);
    expect(result.entries[0]?.capabilities).toEqual(['network']);
  });

  it('parses jsonb columns that arrive as strings', async () => {
    const stringified = database([
      { ...ROW, declared_skills: '["Code Review"]', required_connectors: '["github"]' },
    ]);
    const result = await listPluginRegistryEntries(stringified);
    expect(result.entries[0]?.declaredSkills).toEqual(['Code Review']);
    expect(result.entries[0]?.requiredConnectors).toEqual(['github']);
  });

  it('never surfaces a signature, even when a row somehow carries one', async () => {
    const signed = database([{ ...ROW, signature: 'ZmFrZQ==', signature_algorithm: 'ed25519' }]);
    const result = await listPluginRegistryEntries(signed);
    expect(result.entries[0]?.integrity.signature).toBeNull();
    expect(result.entries[0]?.integrity.signatureAlgorithm).toBeNull();
  });

  it('drops a version ref with a loose version and a malformed digest', async () => {
    const rows = database([
      {
        ...ROW,
        versions: [
          { version: 'latest', releasedAt: '2026-01-01T00:00:00.000Z' },
          { version: '1.0.0', releasedAt: '2026-01-01T00:00:00.000Z', sha256: 'nothex' },
        ],
      },
    ]);
    const result = await listPluginRegistryEntries(rows);
    expect(result.entries[0]?.versions).toHaveLength(1);
    expect(result.entries[0]?.versions[0]).toMatchObject({ version: '1.0.0', sha256: null });
  });

  it('treats an unexpected publisher kind as third-party, never as first-party', async () => {
    const rows = database([{ ...ROW, publisher_kind: 'community' }]);
    const result = await listPluginRegistryEntries(rows);
    expect(result.entries[0]?.publisher.kind).toBe('third-party');
  });
});

describe('getPluginRegistryEntry', () => {
  it('returns the entry and a null manifest for a preview row', async () => {
    const db = database([ROW]);
    const result = await getPluginRegistryEntry(db, 'github-automation');
    expect(result?.entry.id).toBe('github-automation');
    expect(result?.manifest).toBeNull();
  });

  it('returns a stored manifest that satisfies the contract', async () => {
    const db = database([
      {
        ...ROW,
        status: 'published',
        manifest_url: 'https://example.com/plugin.json',
        sha256: DIGEST,
        manifest: { name: 'github-automation', version: '1.0.0', commands: ['commands/pr.md'] },
      },
    ]);
    const result = await getPluginRegistryEntry(db, 'github-automation');
    expect(result?.manifest).toMatchObject({ name: 'github-automation', version: '1.0.0' });
    expect(result?.entry.distribution).toEqual({
      manifestUrl: 'https://example.com/plugin.json',
      sha256: DIGEST,
    });
  });

  it('drops a stored manifest the loader could not use', async () => {
    const db = database([{ ...ROW, manifest: { version: '1.0.0' } }]);
    const result = await getPluginRegistryEntry(db, 'github-automation');
    expect(result?.manifest).toBeNull();
  });

  it('returns null for an unknown id without querying twice', async () => {
    const db = database([]);
    await expect(getPluginRegistryEntry(db, 'nope')).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects a traversal id before it reaches the database', async () => {
    const db = database([ROW]);
    await expect(getPluginRegistryEntry(db, '../../etc/passwd')).resolves.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('throws rather than serving a row that claims published with no artifact', async () => {
    const db = database([{ ...ROW, status: 'published', manifest_url: null }]);
    await expect(getPluginRegistryEntry(db, 'github-automation')).rejects.toBeInstanceOf(
      PluginRegistryDataError,
    );
  });
});
