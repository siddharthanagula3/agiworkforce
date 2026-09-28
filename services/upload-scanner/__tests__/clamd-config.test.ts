import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LOCAL_CLAMD } from '../src/clamd.ts';

function directives(file: string): Map<string, string> {
  const source = readFileSync(new URL(`../clamav/${file}`, import.meta.url), 'utf8');
  const entries = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line): [string, string] => {
      const [name = '', ...value] = line.split(/\s+/);
      return [name, value.join(' ')];
    });
  return new Map(entries);
}

describe('clamd configuration', () => {
  const clamd = directives('clamd.conf');

  it('reports content it cannot scan to the end instead of passing it', () => {
    expect(clamd.get('AlertExceedsMax')).toBe('yes');
    for (const limit of ['MaxScanSize', 'MaxFileSize', 'MaxRecursion', 'MaxFiles']) {
      expect(clamd.get(limit)).not.toBe('0');
    }
  });

  it('spools streamed uploads in memory rather than on disk', () => {
    expect(clamd.get('TemporaryDirectory')).toBe('/dev/shm');
  });

  it('listens only on the loopback address the front end dials', () => {
    expect(clamd.get('TCPAddr')).toBe(LOCAL_CLAMD.host);
    expect(clamd.get('TCPSocket')).toBe(String(LOCAL_CLAMD.port));
  });
});
