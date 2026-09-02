import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const EXTENSION_ROOT = path.resolve(__dirname, '..', '..', '..', 'extension');
const EXTENSION_SRC = path.join(EXTENSION_ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);

function extensionFile(...segments: string[]): string {
  return readFileSync(path.join(EXTENSION_ROOT, ...segments), 'utf8');
}

function walkSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walkSources(full);
    return SOURCE_EXTENSIONS.has(path.extname(full)) ? [full] : [];
  });
}

const EXTENSION_SOURCES = walkSources(EXTENSION_SRC).map((file) => ({
  file: path.relative(EXTENSION_ROOT, file),
  text: readFileSync(file, 'utf8'),
}));

function sourcesMatching(pattern: RegExp): string[] {
  return EXTENSION_SOURCES.filter((source) => pattern.test(source.text)).map(
    (source) => source.file,
  );
}

describe('web cannot hand a computer-use task to the extension', () => {
  it('finds the extension sources this guard depends on', () => {
    expect(extensionFile('manifest.json').length).toBeGreaterThan(0);
    expect(EXTENSION_SOURCES.length).toBeGreaterThan(0);
    expect(EXTENSION_SOURCES.some((source) => source.file.endsWith('src/content.ts'))).toBe(true);
  });

  it('declares no externally_connectable origins', () => {
    expect(JSON.parse(extensionFile('manifest.json')).externally_connectable).toBeUndefined();
  });

  it('registers no external message listener anywhere in the extension', () => {
    expect(sourcesMatching(/onMessageExternal|onConnectExternal/u)).toEqual([]);
  });

  it('opens no page bridge in either direction', () => {
    expect(sourcesMatching(/window\.postMessage/u)).toEqual([]);
    expect(sourcesMatching(/addEventListener\(\s*['"`]message['"`]/u)).toEqual([]);
  });
});
