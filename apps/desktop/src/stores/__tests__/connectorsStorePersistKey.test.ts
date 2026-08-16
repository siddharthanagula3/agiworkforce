import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STORES_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') files.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function scanCall(text: string, open: number): { end: number; commas: number[] } | null {
  let depth = 0;
  const commas: number[] = [];

  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i);
      if (newline === -1) break;
      i = newline;
    } else if (char === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i);
      if (close === -1) break;
      i = close + 1;
    } else if (char === "'" || char === '"' || char === '`') {
      for (i++; i < text.length && text[i] !== char; i++) {
        if (text[i] === '\\') i++;
      }
    } else if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      if (depth === 0) return { end: i, commas };
    } else if (char === ',' && depth === 1) {
      commas.push(i);
    }
  }

  return null;
}

function stringConstants(text: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const [, identifier, , literal] of text.matchAll(
    /const\s+([A-Za-z0-9_$]+)\s*=\s*(['"])([^'"]+)\2/g,
  )) {
    if (identifier && literal) constants.set(identifier, literal);
  }
  return constants;
}

function persistKeys(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const constants = stringConstants(text);
  const keys: string[] = [];

  for (let i = text.indexOf('persist('); i !== -1; i = text.indexOf('persist(', i)) {
    const open = i + 'persist('.length - 1;
    i = open + 1;
    const call = scanCall(text, open);
    if (!call || call.commas.length === 0) continue;
    i = call.end;

    const options = text.slice(call.commas[0], call.end);
    const declared = options.match(/\bname:\s*(?:(['"])([^'"]+)\1|([A-Za-z0-9_$]+))/);
    if (!declared) continue;

    const key = declared[2] ?? (declared[3] ? constants.get(declared[3]) : undefined);
    expect(key, `unresolvable persist key in ${file}`).toBeTypeOf('string');
    keys.push(key ?? '<unresolved>');
  }

  return keys;
}

describe('persisted store keys', () => {
  it('gives every store its own localStorage key', () => {
    const owners = new Map<string, string[]>();

    for (const file of sourceFiles(STORES_ROOT)) {
      for (const key of persistKeys(file)) {
        owners.set(key, [...(owners.get(key) ?? []), file.slice(STORES_ROOT.length + 1)]);
      }
    }

    const collisions = [...owners].filter(([, files]) => files.length > 1);
    expect(collisions).toEqual([]);

    expect([...owners.values()].flat()).toContain('connectorsStore.ts');
    expect(owners.size).toBeGreaterThan(20);
  });
});
