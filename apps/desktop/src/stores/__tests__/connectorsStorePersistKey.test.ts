/**
 * Two zustand stores that persist under one key overwrite each other's payload
 * on every rehydrate, and the lower-versioned one drags the other back through
 * migrations it already ran. `connectorsStore` and `stores/settings/connectors`
 * both claimed `connectors-store` (v7 and v4), so the v7 `version < 6` branch
 * reset `supportedConnectorIds` on every boot; `chatPreferencesStore` and
 * `stores/settings/chatPrefs` had the same pair on
 * `agiworkforce-chat-preferences`.
 *
 * Nothing about either collision was visible at the type level or at runtime,
 * so guard the invariant by reading the persist keys back out of the sources.
 */
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

/**
 * Offsets of the top-level commas and the closing paren of the call whose `(`
 * sits at `open`. Skips comments and string bodies so their brackets and
 * apostrophes do not unbalance the depth count.
 */
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

/** Module-level `const NAME = 'literal'` bindings, for keys held in a const. */
function stringConstants(text: string): Map<string, string> {
  const constants = new Map<string, string>();
  for (const [, identifier, , literal] of text.matchAll(
    /const\s+([A-Za-z0-9_$]+)\s*=\s*(['"])([^'"]+)\2/g,
  )) {
    if (identifier && literal) constants.set(identifier, literal);
  }
  return constants;
}

/** `persist(..., { name })` keys declared in `file`, resolved to their literals. */
function persistKeys(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const constants = stringConstants(text);
  const keys: string[] = [];

  for (let i = text.indexOf('persist('); i !== -1; i = text.indexOf('persist(', i)) {
    const open = i + 'persist('.length - 1;
    i = open + 1;
    const call = scanCall(text, open);
    // A `persist(` inside a comment never balances into a two-argument call.
    if (!call || call.commas.length === 0) continue;
    i = call.end;

    // Options are persist's second argument and always open with `name`.
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

    // Sanity check on the scanner: a silent parse failure would make every
    // collision undetectable, and the assertion above would pass on an empty
    // map. Deliberately key-name agnostic so a rename does not touch this.
    expect([...owners.values()].flat()).toContain('connectorsStore.ts');
    expect(owners.size).toBeGreaterThan(20);
  });
});
