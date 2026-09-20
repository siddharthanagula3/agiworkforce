import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '../../../../..');
const MIGRATIONS = path.join(WEB_ROOT, 'db/neon');
const REGISTRY_TABLE = 'device_registrations';

function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => readFileSync(path.join(MIGRATIONS, entry), 'utf8'))
    .join('\n');
}

const SQL = migrationSql();

/** Every column the registry table carries, read out of the migrations. */
function registryColumns(): string[] {
  const create = new RegExp(`create table[^(]*?\\b${REGISTRY_TABLE}\\b\\s*\\(`, 'is').exec(SQL);
  expect(create, `no migration creates ${REGISTRY_TABLE}`).not.toBeNull();

  let depth = 0;
  let end = (create as RegExpExecArray).index + (create as RegExpExecArray)[0].length - 1;
  for (; end < SQL.length; end += 1) {
    if (SQL[end] === '(') depth += 1;
    else if (SQL[end] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = SQL.slice((create as RegExpExecArray).index, end);

  const columns: string[] = [];
  let nesting = 0;
  for (const line of body.split('\n').slice(1)) {
    const trimmed = line.trim();
    const name = /^([a-z_]+)\s+(uuid|text|boolean|timestamptz|integer|jsonb|bigint)\b/.exec(
      trimmed,
    );
    if (nesting === 0 && name) columns.push(name[1] as string);
    nesting += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
  }

  for (const altered of SQL.matchAll(
    new RegExp(
      `alter table[^;]*?\\b${REGISTRY_TABLE}\\b[^;]*?add column(?: if not exists)?\\s+([a-z_]+)`,
      'gis',
    ),
  )) {
    columns.push(altered[1] as string);
  }
  return [...new Set(columns)];
}

/**
 * Identifiers that follow the machine rather than the installation. One of
 * these in the registry survives a reinstall, a sign-out and a change of owner,
 * which turns a device list into a way to recognise the same hardware again.
 */
const DEVICE_TABLES = ['device_registrations', 'desktop_devices', 'mobile_devices'];

/** Statements that touch a device table, so a neighbouring table's name column is not measured here. */
function deviceStatements(text: string): string[] {
  return text
    .split(';')
    .filter((statement) => DEVICE_TABLES.some((table) => statement.includes(table)));
}

const HARDWARE_IDENTIFIER =
  /\b(serial|serial_number|imei|meid|udid|mac_address|hardware_id|machine_id|motherboard|bios|cpu_id|android_id|idfa|idfv|advertising_id)\b/;

describe('what the device registry may know about a machine', () => {
  const columns = registryColumns();

  it('reads a real table rather than an empty match', () => {
    expect(columns.length).toBeGreaterThan(10);
    expect(columns).toContain('install_id');
    expect(columns).toContain('surface');
  });

  it('holds no identifier that follows the hardware instead of the install', () => {
    const offending = columns.filter((column) => HARDWARE_IDENTIFIER.test(column));

    expect(
      offending,
      `${REGISTRY_TABLE} would recognise the same machine after a reinstall through: ${offending.join(', ')}`,
    ).toEqual([]);
  });

  it('accepts an install id the client can rotate, not one the device is born with', () => {
    const constraint = new RegExp(`install_id[^,]*?~\\s*'([^']+)'`, 'i').exec(SQL);

    expect(constraint, 'install_id no longer constrains its own shape').not.toBeNull();
    expect((constraint as RegExpExecArray)[1]).toMatch(/\{\d+,\d+\}/);
  });

  it('never asks the client for a hardware identifier at the door', () => {
    const contract = readFileSync(
      path.resolve(WEB_ROOT, '../../packages/contracts/cloud-contracts/src/device-registry.ts'),
      'utf8',
    );
    const fields = [...contract.matchAll(/^\s{2,}([a-zA-Z_][\w]*)\s*:/gm)].map((match) =>
      (match[1] as string).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(),
    );

    expect(fields.length).toBeGreaterThan(5);
    expect(fields.filter((field) => HARDWARE_IDENTIFIER.test(field))).toEqual([]);
  });
});

describe('a device name is something to read, not something to key on', () => {
  const columns = registryColumns();

  it('is a column the registry carries', () => {
    expect(columns).toContain('name');
  });

  it('is never made unique, so two laptops may both be called the same thing', () => {
    const uniqueOnName = deviceStatements(SQL)
      .flatMap((statement) => [...statement.matchAll(/unique(?:\s+index[^(]*?)?\s*\(([^)]*)\)/gi)])
      .map((match) => (match[1] ?? '').toLowerCase())
      .filter((columnList) => /\bname\b/.test(columnList));

    expect(
      uniqueOnName,
      `a unique index over ${uniqueOnName.join(' | ')} makes renaming one device fail because of another`,
    ).toEqual([]);
  });

  it('is never a condition of any statement the product runs against a device table', () => {
    const sources: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory)) {
        if (entry === 'node_modules' || entry === '.next') continue;
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) continue;
        sources.push(readFileSync(full, 'utf8'));
      }
    };
    walk(path.join(WEB_ROOT, 'app'));
    walk(path.join(WEB_ROOT, 'lib'));

    const keyedOnName = deviceStatements(sources.join('\n')).filter((statement) =>
      /where[\s\S]{0,160}?\bname\s*=\s*\$\d/i.test(statement),
    );

    expect(
      keyedOnName.map((statement) => statement.replace(/\s+/g, ' ').slice(0, 80)),
      'a device is being found by its name, which nothing guarantees is unique',
    ).toEqual([]);
  });
});
