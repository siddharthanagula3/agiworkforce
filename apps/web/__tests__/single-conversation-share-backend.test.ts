import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const WEB_ROOT = resolve(__dirname, '..');

const LEGACY_PATHS = [
  'app/api/shared/route.ts',
  'app/shared/[id]/page.tsx',
  'app/shared/[id]/SharedMessageTimestamp.tsx',
];

const SCAN_ROOTS = ['app', 'features', 'shared', 'lib', 'components'];
const SOURCE_EXT = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '__tests__') continue;
    if (TEST_FILE.test(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('conversation sharing has exactly one backend', () => {
  it('keeps the live /api/share -> shared_sessions -> /share/[token] path', () => {
    expect(existsSync(join(WEB_ROOT, 'app/api/share/route.ts'))).toBe(true);
    expect(existsSync(join(WEB_ROOT, 'app/share/[token]/page.tsx'))).toBe(true);
  });

  it.each(LEGACY_PATHS)('does not ship the orphaned legacy share file %s', (relPath) => {
    expect(existsSync(join(WEB_ROOT, relPath))).toBe(false);
  });

  it('exposes no /shared/<id> public route segment', () => {
    expect(existsSync(join(WEB_ROOT, 'app/shared'))).toBe(false);
  });

  it('has no source reference to the legacy /api/shared endpoint', () => {
    const offenders = SCAN_ROOTS.flatMap((root) => sourceFiles(join(WEB_ROOT, root)))
      .filter((file) => /\/api\/shared(?![a-zA-Z0-9_/-])/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(WEB_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('has no source writer for the legacy shared_conversations table outside account erasure', () => {
    const offenders = SCAN_ROOTS.flatMap((root) => sourceFiles(join(WEB_ROOT, root)))
      .filter((file) =>
        /\b(insert into|update)\s+shared_conversations\b/i.test(readFileSync(file, 'utf8')),
      )
      .map((file) => file.slice(WEB_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });
});
