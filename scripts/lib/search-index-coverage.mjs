import fs from 'node:fs';
import path from 'node:path';

export function readMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

/**
 * The live body of each `create or replace function`, last definition winning,
 * so a trigger rewritten by a later migration is read as it will actually run.
 */
export function liveFunctionBodies(migrations) {
  const bodies = new Map();
  const header = /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(/gi;
  for (const { sql } of migrations) {
    header.lastIndex = 0;
    let match;
    while ((match = header.exec(sql)) !== null) {
      const open = sql.indexOf('$$', match.index);
      if (open === -1) continue;
      const close = sql.indexOf('$$', open + 2);
      if (close === -1) continue;
      bodies.set(match[1], sql.slice(open + 2, close));
    }
  }
  return bodies;
}

export function stringArrayConst(source, name) {
  const start = source.indexOf(`${name} = [`);
  if (start === -1) return null;
  const end = source.indexOf(']', start);
  if (end === -1) return null;
  return [...source.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

export function checkConstraintValues(sql, column) {
  const at = sql.indexOf(`${column} in (`);
  if (at === -1) return null;
  const close = sql.indexOf(')', at);
  if (close === -1) return null;
  return [...sql.slice(at, close).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

/** Every `(source_kind = 'x') = (x_id is not null)` pair in the table constraint. */
export function singleSourceMapping(sql) {
  return Object.fromEntries(
    [...sql.matchAll(/\(source_kind = '([a-z_]+)'\)\s*=\s*\((\w+) is not null\)/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

export function enqueueCaseKinds(sql) {
  return [
    ...new Set(
      [...sql.matchAll(/case when p_source_kind = '([a-z_]+)' then/g)].map((match) => match[1]),
    ),
  ];
}

export function cascadingColumns(sql) {
  return [
    ...sql.matchAll(/^\s*(\w+)\s+uuid\s+references\s+public\.\w+\(id\)\s+on delete cascade/gim),
  ].map((match) => match[1]);
}

export function switchCaseArms(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const region = source.slice(at, at + 12_000);
  return [...new Set([...region.matchAll(/case '([a-z_]+)':/g)].map((match) => match[1]))];
}

/** Each `case 'kind':` arm's body, so what a loader admits can be read per kind. */
export function switchArmBodies(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const region = source.slice(at, at + 12_000);
  const arms = {};
  const starts = [...region.matchAll(/case '([a-z_]+)':/g)];
  for (let index = 0; index < starts.length; index += 1) {
    const from = starts[index].index + starts[index][0].length;
    const to = index + 1 < starts.length ? starts[index + 1].index : region.length;
    arms[starts[index][1]] = region.slice(from, to);
  }
  return arms;
}

export function quotedArgumentsTo(text, fn) {
  const needle = `${fn}(`;
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const close = text.indexOf(')', at);
    if (close === -1) break;
    for (const match of text.slice(at, close).matchAll(/'([a-z_]+)'/g)) found.push(match[1]);
  }
  return [...new Set(found)];
}
