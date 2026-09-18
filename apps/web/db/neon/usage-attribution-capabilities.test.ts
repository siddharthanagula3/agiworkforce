import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COGS_CAPABILITIES,
  COGS_UNIT_BASES,
  resolveCogsCapability,
  resolveCogsUnits,
  type CogsCapability,
} from '@/lib/services/cogs-ledger-service';

const migrationsDir = join(process.cwd(), 'db/neon');

function executableSql(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8')
    .split('\n')
    .map((line) => line.replace(/--.*$/u, ''))
    .join('\n');
}

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

/**
 * The capability list the database will actually enforce: the last migration
 * that rewrites the check constraint wins, so reading the newest one is what
 * the running schema says rather than what any single file says.
 */
function enforcedCapabilities(): readonly string[] {
  for (const filename of [...migrations].reverse()) {
    const sql = executableSql(filename);
    const match =
      /add constraint provider_cost_events_capability_check check \(capability = any \(array\[([^\]]+)\]\)\)/i.exec(
        sql,
      );
    if (match?.[1]) {
      return match[1]
        .split(',')
        .map((value) => value.trim().replace(/^'|'$/gu, ''))
        .filter((value) => value.length > 0);
    }
  }
  throw new Error('No migration defines provider_cost_events_capability_check');
}

function enforcedUnitBases(): readonly string[] {
  for (const filename of [...migrations].reverse()) {
    const sql = executableSql(filename);
    const match =
      /add constraint provider_cost_events_unit_basis_check check \(unit_basis = any \(array\[([^\]]+)\]\)\)/i.exec(
        sql,
      );
    if (match?.[1]) {
      return match[1]
        .split(',')
        .map((value) => value.trim().replace(/^'|'$/gu, ''))
        .filter((value) => value.length > 0);
    }
  }
  throw new Error('No migration defines provider_cost_events_unit_basis_check');
}

describe('usage attribution capabilities', () => {
  it('enforces exactly the capabilities the ledger writes', () => {
    expect([...enforcedCapabilities()].sort()).toEqual([...COGS_CAPABILITIES].sort());
  });

  it('enforces exactly the unit bases the ledger writes', () => {
    expect([...enforcedUnitBases()].sort()).toEqual([...COGS_UNIT_BASES].sort());
  });

  it('meters browser time as its own capability, not as generic computer use', () => {
    const capabilities = enforcedCapabilities();
    expect(capabilities).toContain('browser');
    expect(capabilities).toContain('computer_use');

    const browser = resolveCogsUnits('browser', { computeMinutes: 12 });
    const computerUse = resolveCogsUnits('computer_use', { requests: 12 });
    expect(browser).toEqual({ unitBasis: 'minute', units: 12 });
    expect(computerUse).toEqual({ unitBasis: 'request', units: 12 });
    expect(browser.unitBasis).not.toBe(computerUse.unitBasis);
  });

  it('meters compute per lane rather than folding it into one second count', () => {
    const capabilities = enforcedCapabilities();
    for (const capability of ['work_compute', 'code_compute', 'database', 'sandbox'] as const) {
      expect(capabilities, capability).toContain(capability);
    }
    expect(resolveCogsUnits('work_compute', { computeMinutes: 5 })).toEqual({
      unitBasis: 'minute',
      units: 5,
    });
    expect(resolveCogsUnits('code_compute', { computeMinutes: 5 })).toEqual({
      unitBasis: 'minute',
      units: 5,
    });
    expect(resolveCogsUnits('database', { computeSeconds: 90 })).toEqual({
      unitBasis: 'second',
      units: 90,
    });
  });

  it('meters a paid tool call per request, which is what 0169 added', () => {
    expect(enforcedCapabilities()).toContain('tool');
    expect(resolveCogsCapability({ operation: 'tool' })).toBe('tool');
    expect(resolveCogsUnits('tool', { requests: 3 })).toEqual({ unitBasis: 'request', units: 3 });
  });

  it('gives every capability a unit basis the constraint accepts', () => {
    const bases = new Set(enforcedUnitBases());
    for (const capability of COGS_CAPABILITIES as readonly CogsCapability[]) {
      const { unitBasis } = resolveCogsUnits(capability, {});
      expect(bases.has(unitBasis), `${capability} -> ${unitBasis}`).toBe(true);
    }
  });

  it('carries the workspace dimension beside the funding organization', () => {
    const sql = migrations.map(executableSql).join('\n');
    expect(sql).toMatch(
      /alter table public\.provider_cost_events\s+add column if not exists workspace_id uuid references public\.workspaces\(id\) on delete set null/i,
    );
    expect(sql).toContain('idx_provider_cost_events_workspace');
    expect(sql).toMatch(
      /alter table public\.provider_cost_events\s+add column if not exists organization_id uuid references public\.organizations\(id\) on delete set null/i,
    );
  });
});
