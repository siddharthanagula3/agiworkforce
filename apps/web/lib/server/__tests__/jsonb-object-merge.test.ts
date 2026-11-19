import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isJsonObject,
  jsonObjectOf,
  jsonbObjectSql,
  mergeJsonbObjectSql,
} from '@/lib/server/jsonb-object-merge';

const WEB_ROOT = resolve(import.meta.dirname, '../../..');

describe('jsonObjectOf, the read of a stored metadata value', () => {
  it('keeps an object as it is', () => {
    const stored = { sources: [{ url: 'https://example.com' }], finishReason: 'stop' };
    expect(jsonObjectOf(stored)).toBe(stored);
  });

  it('reads SQL NULL, JSON null and every scalar as an empty object', () => {
    expect(jsonObjectOf(null)).toEqual({});
    expect(jsonObjectOf(undefined)).toEqual({});
    expect(jsonObjectOf('stop')).toEqual({});
    expect(jsonObjectOf(7)).toEqual({});
    expect(jsonObjectOf(true)).toEqual({});
  });

  it('recovers the object a merge onto JSON null wrapped in an array', () => {
    expect(jsonObjectOf([null, { followUpSuggestions: ['Why?', 'How?'] }])).toEqual({
      followUpSuggestions: ['Why?', 'How?'],
    });
  });

  it('applies the objects of a longer array in order, later keys winning', () => {
    expect(
      jsonObjectOf([null, { finishReason: 'length', model: 'a' }, 'x', { finishReason: 'stop' }]),
    ).toEqual({ finishReason: 'stop', model: 'a' });
  });

  it('reads an array that holds no object as an empty object', () => {
    expect(jsonObjectOf([])).toEqual({});
    expect(jsonObjectOf([null, 1, [{ a: 1 }]])).toEqual({});
  });

  it('copies a stored __proto__ key as data, never as the prototype', () => {
    const element = JSON.parse('{"__proto__": {"polluted": true}, "kept": 1}') as object;
    const recovered = jsonObjectOf([null, element]);
    expect(Object.getPrototypeOf(recovered)).toBe(Object.prototype);
    expect((recovered as { polluted?: unknown }).polluted).toBeUndefined();
    expect(recovered['kept']).toBe(1);
  });

  it('tells an object apart from an array and from null', () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject('{}')).toBe(false);
  });
});

describe('jsonbObjectSql and mergeJsonbObjectSql', () => {
  it('reads the stored value once and decides by its jsonb type', () => {
    const sql = jsonbObjectSql('message.metadata');
    expect(sql.match(/message\.metadata/g)).toHaveLength(1);
    expect(sql).toContain('(select (message.metadata)::jsonb as value) as candidate');
    expect(sql).toContain("when 'object' then candidate.value");
    expect(sql).toContain('jsonb_array_elements(candidate.value) with ordinality');
    expect(sql).toContain('order by element.idx');
    expect(sql).toContain("else '{}'::jsonb");
  });

  it('merges only objects, whatever either side holds', () => {
    expect(mergeJsonbObjectSql('m.metadata', '$4::jsonb')).toBe(
      `(${jsonbObjectSql('m.metadata')} || ${jsonbObjectSql('$4::jsonb')})`,
    );
  });
});

const MERGE_ONTO_RAW_METADATA =
  /\b(?:[a-z_]+\.)?metadata\s*\|\|\s*(?:\$\d|\$\{|jsonb|'|excluded\.|incoming\.)|coalesce\(\s*(?:[a-z_]+\.)?metadata\s*,\s*'\{\}'::jsonb\s*\)\s*\|\||(?:jsonb|\$\d+|'|\))\s*\|\|\s*(?:coalesce\(\s*)?(?:[a-z_]+\.)?metadata\b(?!\s*(?:->|#>|\?|\.|\[))/gi;

describe('the scan for a merge onto the stored metadata', () => {
  const flagged = (sql: string) => [...sql.matchAll(MERGE_ONTO_RAW_METADATA)].length > 0;

  it('flags a patch merged onto the stored value from either side', () => {
    expect(flagged(`set metadata = metadata || $1::jsonb`)).toBe(true);
    expect(flagged(`set metadata = coalesce(m.metadata, '{}'::jsonb) || $4::jsonb`)).toBe(true);
    expect(flagged(`set metadata = $1::jsonb || metadata`)).toBe(true);
    expect(flagged(`set metadata = '{"a": 1}'::jsonb || coalesce(message.metadata, '{}')`)).toBe(
      true,
    );
    expect(flagged(`set metadata = jsonb_build_object('a', $2::text) || m.metadata`)).toBe(true);
  });

  it('leaves the shared helper, path reads and ordinary TypeScript alone', () => {
    expect(flagged(`set metadata = ${mergeJsonbObjectSql('metadata', '$1::jsonb')}`)).toBe(false);
    expect(flagged(`where $1::text || metadata ->> 'requestId' = $2`)).toBe(false);
    expect(flagged(`const rating = previous || metadata.rating;`)).toBe(false);
    expect(flagged(`const paywall = answer.error || answer.metadata?.paywall;`)).toBe(false);
    expect(flagged(`const kind = fallback() || metadata['videoInputKind'];`)).toBe(false);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('every metadata merge in the web app', () => {
  it('goes through mergeJsonbObjectSql rather than concatenating onto the stored value', () => {
    const offenders = ['app', 'lib', 'features'].flatMap((folder) =>
      sourceFiles(join(WEB_ROOT, folder)).flatMap((path) => {
        const file = relative(WEB_ROOT, path);
        const code = readFileSync(path, 'utf8')
          .split('\n')
          .map((line) => (/^\s*(?:\*|\/\/|\/\*)/.test(line) ? '' : line))
          .join('\n');
        return [...code.matchAll(MERGE_ONTO_RAW_METADATA)].map(
          (match) => `${file}:${code.slice(0, match.index).split('\n').length}`,
        );
      }),
    );
    expect(offenders).toEqual([]);
  });
});
