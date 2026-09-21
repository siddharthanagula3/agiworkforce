import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORKSPACE_SCOPED_CONTENT_TABLES, workspaceSurfaceForTable } from '..';
import { WORKSPACE_SWITCH_SURFACES, workspaceSwitchTables } from '../switch-surfaces';

const MIGRATIONS = path.resolve(__dirname, '../../../../db/neon');
const OWNER_COLUMN = 'user_id';
const WORKSPACE_COLUMN = 'organization_id';

function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The columns each table carries, read from the migrations themselves rather
 * than from a list: a table that gains or loses its workspace column changes
 * this answer without anybody remembering to edit a fixture.
 */
function schemaColumns(): Map<string, Set<string>> {
  const columns = new Map<string, Set<string>>();
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql') && !name.includes('.down.'))
    .sort();

  for (const name of files) {
    const sql = withoutComments(readFileSync(path.join(MIGRATIONS, name), 'utf8'));

    for (const created of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi,
    )) {
      const table = created[1] as string;
      const found = columns.get(table) ?? new Set<string>();
      for (const line of (created[2] as string).split('\n')) {
        const column = line.trim().match(/^([a-z0-9_]+)\s+/i);
        if (column) found.add((column[1] as string).toLowerCase());
      }
      columns.set(table, found);
    }

    for (const added of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi,
    )) {
      const table = added[1] as string;
      const found = columns.get(table) ?? new Set<string>();
      found.add((added[2] as string).toLowerCase());
      columns.set(table, found);
    }

    for (const dropped of sql.matchAll(
      /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi,
    )) {
      columns.delete(dropped[1] as string);
    }
  }

  return columns;
}

const COLUMNS = schemaColumns();

function isPartitioned(table: string): boolean {
  const found = COLUMNS.get(table);
  return found !== undefined && found.has(OWNER_COLUMN) && found.has(WORKSPACE_COLUMN);
}

describe('what a workspace switch changes, surface by surface', () => {
  it('reads a schema to check against', () => {
    expect(COLUMNS.size).toBeGreaterThan(100);
    expect(isPartitioned('web_conversations')).toBe(true);
  });

  it('names a distinct surface once each, and no table twice', () => {
    const names = WORKSPACE_SWITCH_SURFACES.map((entry) => entry.surface);
    expect(new Set(names).size).toBe(names.length);
    const claimed = WORKSPACE_SWITCH_SURFACES.flatMap((entry) => entry.tables);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('only names tables the migrations create', () => {
    const missing = workspaceSwitchTables().filter((table) => !COLUMNS.has(table));
    expect(missing).toEqual([]);
  });

  it('leaves no workspace-partitioned table outside every surface', () => {
    const claimed = new Set(workspaceSwitchTables());
    const unclaimed = [...COLUMNS.keys()]
      .filter((table) => isPartitioned(table) && !claimed.has(table))
      .sort();
    expect(unclaimed).toEqual([]);
  });

  it('backs each declared effect with the columns the tables actually carry', () => {
    const wrong: string[] = [];

    for (const entry of WORKSPACE_SWITCH_SURFACES) {
      for (const table of entry.tables) {
        const found = COLUMNS.get(table);
        if (!found) continue;
        const partitioned = found.has(OWNER_COLUMN) && found.has(WORKSPACE_COLUMN);

        if (entry.effect === 'partitioned' && !partitioned) {
          wrong.push(`${entry.surface}: ${table} is claimed to switch and carries no pair`);
        }
        if (entry.effect === 'account-wide' && found.has(WORKSPACE_COLUMN)) {
          wrong.push(`${entry.surface}: ${table} carries a workspace column after all`);
        }
        if (entry.effect === 'organization-only' && !found.has(WORKSPACE_COLUMN)) {
          wrong.push(`${entry.surface}: ${table} belongs to no organization`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it('states why a surface a switch does not change is that way', () => {
    const unexplained = WORKSPACE_SWITCH_SURFACES.filter(
      (entry) => entry.effect !== 'partitioned' && (entry.why ?? '').trim().length <= 30,
    ).map((entry) => entry.surface);
    expect(unexplained).toEqual([]);
  });

  it('answers transferable, copyable and exportable for every surface', () => {
    const undecided = WORKSPACE_SWITCH_SURFACES.filter(
      (entry) =>
        typeof entry.transferable !== 'boolean' ||
        typeof entry.copyable !== 'boolean' ||
        typeof entry.exportable !== 'boolean',
    ).map((entry) => entry.surface);
    expect(undecided).toEqual([]);
  });

  it('puts every table erasure treats as workspace content on a surface that switches', () => {
    const adrift = WORKSPACE_SCOPED_CONTENT_TABLES.filter((table) => {
      const surface = workspaceSurfaceForTable(table);
      if (surface === null) return true;
      return (
        WORKSPACE_SWITCH_SURFACES.find((entry) => entry.surface === surface)?.effect !==
        'partitioned'
      );
    });
    expect(adrift).toEqual([]);
  });

  it('never calls a surface transferable that has nowhere in the other workspace to land', () => {
    const impossible = WORKSPACE_SWITCH_SURFACES.filter(
      (entry) => entry.transferable && entry.effect !== 'partitioned',
    ).map((entry) => entry.surface);
    expect(impossible).toEqual([]);
  });
});
