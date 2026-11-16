import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LOCAL_CLAMD } from '../src/clamd.ts';
import { CLAMD_SOURCE_SCAN_SETTINGS, SOURCE_SCAN_DEFAULTS, clamdSizeBytes } from '../src/config.ts';
import { clamdConfigText } from '../src/daemons.ts';

function readConfig(file: string): string {
  return readFileSync(new URL(`../clamav/${file}`, import.meta.url), 'utf8');
}

function parse(source: string): Map<string, string> {
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

function directives(file: string): Map<string, string> {
  return parse(readConfig(file));
}

describe('clamd configuration', () => {
  const clamd = directives('clamd.conf');

  it('reports content it cannot scan to the end instead of passing it', () => {
    expect(clamd.get('AlertExceedsMax')).toBe('yes');
    expect(clamd.get('AlertEncrypted')).toBe('yes');
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

describe('clamd configuration for source scans', () => {
  const base = readConfig('clamd.conf');
  const generated = clamdConfigText(base, CLAMD_SOURCE_SCAN_SETTINGS);
  const settings = parse(generated);

  it('pins every size-gated setting of the clamd settings table', () => {
    expect(CLAMD_SOURCE_SCAN_SETTINGS).toEqual({
      StreamMaxLength: '520M',
      MaxFileSize: '520M',
      MaxScanSize: '1024M',
      PCREMaxFileSize: '520M',
      MaxEmbeddedPE: '520M',
      MaxHTMLNormalize: '40M',
      MaxHTMLNoTags: '8M',
      MaxScriptNormalize: '20M',
      MaxZipTypeRcg: '1M',
      MaxRecursion: '17',
      MaxFiles: '10000',
      MaxScanTime: '600000',
      ReadTimeout: '300',
      AlertExceedsMax: 'yes',
      AlertEncrypted: 'yes',
      TemporaryDirectory: '/var/tmp/clamd',
    });
  });

  it('applies the table over the legacy file and keeps everything else from it', () => {
    for (const [name, value] of Object.entries(CLAMD_SOURCE_SCAN_SETTINGS)) {
      expect(settings.get(name)).toBe(value);
    }
    expect(settings.get('TCPAddr')).toBe(LOCAL_CLAMD.host);
    expect(settings.get('TCPSocket')).toBe(String(LOCAL_CLAMD.port));
    expect(settings.get('DatabaseDirectory')).toBe('/var/lib/clamav');
    expect(settings.get('ExitOnOOM')).toBe('yes');
    const names = generated
      .split('\n')
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name) => name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lets clamd read every byte the scanner admits', () => {
    for (const limit of ['StreamMaxLength', 'MaxFileSize', 'PCREMaxFileSize', 'MaxEmbeddedPE']) {
      expect(clamdSizeBytes(settings.get(limit) ?? '0')).toBeGreaterThanOrEqual(
        SOURCE_SCAN_DEFAULTS.maxBytes,
      );
    }
    expect(clamdSizeBytes(settings.get('MaxScanSize') ?? '0')).toBeGreaterThan(
      SOURCE_SCAN_DEFAULTS.maxBytes,
    );
  });

  it('spools in a directory the image creates for the scanner user', () => {
    const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile).toContain(String(settings.get('TemporaryDirectory')));
  });

  it('reads clamd sizes with and without a unit', () => {
    expect(clamdSizeBytes('520M')).toBe(545_259_520);
    expect(clamdSizeBytes('8k')).toBe(8192);
    expect(clamdSizeBytes('17')).toBe(17);
    expect(() => clamdSizeBytes('1G')).toThrow();
  });
});
