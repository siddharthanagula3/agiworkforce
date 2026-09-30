import { readFileSync } from 'node:fs';

export interface TomlTable {
  name: string;
  entries: Record<string, string>;
}

function unquote(value: string): string {
  const quoted = /^'(.*)'$/.exec(value) ?? /^"(.*)"$/.exec(value);
  return quoted?.[1] ?? value;
}

export function readTomlTables(path: string): TomlTable[] {
  const tables: TomlTable[] = [{ name: '', entries: {} }];
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (header?.[1]) {
      tables.push({ name: header[1].trim(), entries: {} });
      continue;
    }
    const pair = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
    const table = tables[tables.length - 1];
    if (pair?.[1] && pair[2] && table) table.entries[pair[1]] = unquote(pair[2].trim());
  }
  return tables;
}

export function tomlTable(tables: readonly TomlTable[], name: string): Record<string, string> {
  const table = tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`no [${name}] table`);
  return table.entries;
}
