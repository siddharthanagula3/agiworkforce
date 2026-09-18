import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { COGS_CAPABILITIES, COGS_UNIT_BASES } from '@/lib/services/cogs-ledger-service';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0215_cogs_full_cost_surface.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0215_cogs_full_cost_surface.down.sql'),
  'utf8',
);
const capabilityWidening = fs.readFileSync(
  path.resolve(import.meta.dirname, '0221_connector_and_artifact_cost_capabilities.sql'),
  'utf8',
);
const capabilityWideningReversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0221_connector_and_artifact_cost_capabilities.down.sql'),
  'utf8',
);
const visualCapabilityReversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0246_visual_session_cost_capability.down.sql'),
  'utf8',
);
const mediaHash = fs.readFileSync(
  path.resolve(import.meta.dirname, '0216_media_assets_content_hash.sql'),
  'utf8',
);
const mediaHashReversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0216_media_assets_content_hash.down.sql'),
  'utf8',
);

function constraintValues(source: string, column: string): string[] {
  const body = new RegExp(
    `add constraint provider_cost_events_${column}_check check \\(${column} = any \\(array\\[([\\s\\S]*?)\\]\\)\\)`,
  ).exec(source)?.[1];
  expect(body).toBeDefined();
  return [...(body ?? '').matchAll(/'([a-z_]+)'/g)].map((match) => match[1] ?? '');
}

/** The newest migration that rewrites the constraint is what the schema enforces. */
function latestCapabilityWidening(): string {
  const directory = import.meta.dirname;
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .reverse();
  for (const name of files) {
    const sql = fs.readFileSync(path.resolve(directory, name), 'utf8');
    if (/add constraint provider_cost_events_capability_check/.test(sql)) return sql;
  }
  throw new Error('No migration defines provider_cost_events_capability_check');
}

describe('cogs full cost surface migration', () => {
  it('accepts every capability the ledger writes once the newest widening is applied', () => {
    expect(constraintValues(latestCapabilityWidening(), 'capability').sort()).toEqual(
      [...COGS_CAPABILITIES].sort(),
    );
  });

  it('leaves 0215 as the historical subset it was applied as', () => {
    const applied = constraintValues(migration, 'capability');
    expect(applied).toContain('storage');
    expect(applied).not.toContain('connector');
    expect(applied).not.toContain('artifact');
  });

  it('accepts every unit basis the ledger writes', () => {
    expect(constraintValues(migration, 'unit_basis').sort()).toEqual([...COGS_UNIT_BASES].sort());
  });

  it('gives a cache hit an accounting line of its own', () => {
    expect(migration).toContain(
      'add column if not exists cache_hit boolean not null default false',
    );
    expect(migration).toContain('add column if not exists avoided_cost_microusd bigint');
    expect(migration).toContain('idx_provider_cost_events_cache_hit');
  });

  it('clears the rows the narrower constraints could not hold before restoring them', () => {
    const deleteAt = reversal.indexOf('delete from public.provider_cost_events');
    const constraintAt = reversal.indexOf('add constraint provider_cost_events_unit_basis_check');
    expect(deleteAt).toBeGreaterThan(-1);
    expect(constraintAt).toBeGreaterThan(deleteAt);
    expect(constraintValues(reversal, 'capability')).not.toContain('storage');
  });

  it('names connector calls and generated-file storage as capabilities of their own', () => {
    expect(constraintValues(capabilityWidening, 'capability')).toEqual(
      expect.arrayContaining(['connector', 'artifact']),
    );
  });

  it('names a live camera or screen share as a capability of its own', () => {
    expect(constraintValues(latestCapabilityWidening(), 'capability')).toContain('visual');
    expect(constraintValues(visualCapabilityReversal, 'capability')).not.toContain('visual');
    expect(visualCapabilityReversal.indexOf("where capability = 'visual'")).toBeLessThan(
      visualCapabilityReversal.indexOf('add constraint provider_cost_events_capability_check'),
    );
  });

  it('clears the rows the 0215 constraint cannot hold before restoring it', () => {
    const deleteAt = capabilityWideningReversal.indexOf(
      "delete from public.provider_cost_events\n where capability in ('connector', 'artifact')",
    );
    const constraintAt = capabilityWideningReversal.indexOf(
      'add constraint provider_cost_events_capability_check',
    );
    expect(deleteAt).toBeGreaterThan(-1);
    expect(constraintAt).toBeGreaterThan(deleteAt);
    expect(constraintValues(capabilityWideningReversal, 'capability')).not.toContain('connector');
  });
});

describe('media asset content hash migration', () => {
  it('stores a sha-256 digest and refuses anything else', () => {
    expect(mediaHash).toContain('add column if not exists content_sha256 text');
    expect(mediaHash).toContain("content_sha256 ~ '^[0-9a-f]{64}$'");
  });

  it('indexes the digest inside the owner scope only, and not uniquely', () => {
    expect(mediaHash).toContain('on public.media_assets (user_id, content_sha256)');
    expect(mediaHash).not.toContain('create unique index');
    expect(mediaHash).toContain('where content_sha256 is not null and deleted_at is null');
  });

  it('is reversible without deleting an asset', () => {
    expect(mediaHashReversal).toContain('drop column if exists content_sha256');
    expect(mediaHashReversal).not.toContain('delete from public.media_assets');
    expect(mediaHashReversal).toContain('0216_media_assets_content_hash.sql');
  });
});
