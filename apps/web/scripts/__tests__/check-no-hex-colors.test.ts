import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptsDir = dirname(dirname(fileURLToPath(import.meta.url)));
const webDir = dirname(scriptsDir);
const repoRoot = dirname(dirname(webDir));
const guard = join(scriptsDir, 'check-no-hex-colors.mjs');

let fixtureRoot: string;
let baseline: string;

function write(relPath: string, contents: string) {
  const full = join(fixtureRoot, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function runGuard(...extra: string[]) {
  const result = spawnSync(
    process.execPath,
    [guard, '--root', fixtureRoot, '--baseline', baseline, ...extra],
    { encoding: 'utf8' },
  );
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'no-hex-web-'));
  baseline = join(fixtureRoot, 'scripts', '.no-hex-baseline.json');
  write('app/page.tsx', 'export const Page = () => <div className="bg-primary" />;\n');
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('check:no-hex-web', () => {
  it('finds literals in nested directories, not just the top level of each source root', () => {
    write('features/chat/components/Card.tsx', "const s = { color: '#123456' };\n");

    const { code, out } = runGuard();

    expect(out).toContain('features/chat/components/Card.tsx:1');
    expect(out).toContain('#123456');
    expect(code).toBe(1);
  });

  it('passes a tree whose only literals are tokenised', () => {
    write('features/chat/Card.tsx', "const s = { color: 'var(--chat-accent)' };\n");

    expect(runGuard().code).toBe(0);
  });

  it('exempts Web App Manifest color keys, test files, and globals.css', () => {
    write(
      'app/manifest.ts',
      "export default () => ({ background_color: '#0a0a0a', theme_color: '#0a0a0a' });\n",
    );
    write('app/brand-assets.test.ts', "expect(svg).toContain('#f4f1e8');\n");
    write('app/globals.css', ':root { --chat-bg: #0a0a0a; }\n');

    const { code, out } = runGuard();

    expect(out).not.toContain('manifest.ts');
    expect(out).not.toContain('brand-assets.test.ts');
    expect(out).not.toContain('globals.css');
    expect(code).toBe(0);
  });

  it('grandfathers baselined literals but still fails on a newly added one', () => {
    write('features/chat/components/Card.tsx', "const s = { color: '#123456' };\n");
    expect(runGuard('--write-baseline').code).toBe(0);
    expect(JSON.parse(readFileSync(baseline, 'utf8')).violations).toHaveLength(1);
    expect(runGuard().code).toBe(0);

    write(
      'features/chat/components/Card.tsx',
      "const s = { color: '#123456', border: '#abcdef' };\n",
    );

    const { code, out } = runGuard();

    expect(out).toContain('#abcdef');
    expect(out).not.toContain('#123456');
    expect(code).toBe(1);
  });

  it('is invoked by CI so a new literal cannot ship undetected', () => {
    const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

    expect(ci).toContain('check:no-hex-web');
  });
});
