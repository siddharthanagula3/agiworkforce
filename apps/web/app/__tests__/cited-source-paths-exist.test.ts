import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globSync } from 'node:fs';

const WEB = process.cwd();
const REPO = resolve(WEB, '../..');

const PATH_PATTERN =
  /\b((?:apps\/[a-z-]+\/)?(?:app|lib|features|shared|db|packages|scripts)\/[A-Za-z0-9._/[\]-]+\.(?:ts|tsx|sql|mjs|json))\b/g;

function renderedCopy(file: string): string {
  // Block comments are notes to the next engineer, not claims to the reader.
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

function pages(): string[] {
  return [
    ...globSync('app/*/page.tsx', { cwd: WEB }),
    ...globSync('app/*/*/page.tsx', { cwd: WEB }),
  ].map((p) => join(WEB, p));
}

// macOS volumes ignore case, so existsSync alone passes a citation that Linux CI rejects.
function existsWithExactCase(root: string, relative: string): boolean {
  let dir = root;
  for (const segment of relative.split('/')) {
    if (!existsSync(dir) || !readdirSync(dir).includes(segment)) return false;
    dir = join(dir, segment);
  }
  return true;
}

function resolves(cited: string): boolean {
  const candidates = cited.startsWith('apps/') ? [cited] : [cited, `apps/web/${cited}`];
  return candidates.some((c) => existsWithExactCase(REPO, c) || existsWithExactCase(WEB, c));
}

// These pages cite source paths as EVIDENCE, the subprocessor table names the
// route that sends a prompt to each vendor, the privacy pages name the erasure
// inventory. A moved file turns a checkable disclosure into an unverifiable
// assertion, and nothing else would notice.
describe('source paths cited in user-facing copy still exist', () => {
  it('finds citations at all, so this cannot pass vacuously', () => {
    const found = pages().flatMap((p) => [...renderedCopy(p).matchAll(PATH_PATTERN)]);
    expect(found.length).toBeGreaterThan(10);
  });

  it('resolves every cited path', () => {
    const broken: string[] = [];
    for (const page of pages()) {
      for (const match of renderedCopy(page).matchAll(PATH_PATTERN)) {
        const cited = match[1] as string;
        if (!resolves(cited)) broken.push(`${page.replace(WEB, '')} -> ${cited}`);
      }
    }
    expect(broken, `copy cites source path(s) that no longer exist:\n${broken.join('\n')}`).toEqual(
      [],
    );
  });
});
