import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const SEARCH_ROOTS = ['apps/web', 'packages/ui'];
const SKIP_DIRS = /^(?:\.|node_modules$|\.next$|dist$|build$|coverage$|__snapshots__$)/;
const SOURCE_FILE = /\.(?:tsx?|css)$/;
const RETIRED_TOKEN = /--agi-amber\b/;

/**
 * `--agi-amber` no longer exists. The public design system is one blue accent
 * held by `--agi-accent`, `--agi-accent-text` and `--agi-accent-soft`, so the
 * token has no definition in any stylesheet and every marketing call site was
 * moved onto the accent roles.
 *
 * What is left below reads the name with a literal fallback, which is why those
 * surfaces survive the definitions being deleted. The list may only shrink, and
 * nothing may define the token again: a redefinition would silently repaint
 * whichever surface still reads it.
 */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'apps/web/features/support/components/SupportWidget.module.css',
    why: 'reads it with a literal fallback, so it survived the definitions being deleted',
  },
  {
    file: 'packages/ui/ui/src/AgiMark.tsx',
    why: 'reads it with a currentColor fallback for the mark on marketing grounds',
  },
  {
    file: 'apps/web/shared/components/__tests__/retired-amber-token.test.ts',
    why: 'this guard',
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.test(entry.name) ? [] : sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

function referencingFiles(): string[] {
  return SEARCH_ROOTS.flatMap((root) => sourceFiles(join(REPO_ROOT, root)))
    .filter((file) => RETIRED_TOKEN.test(readFileSync(file, 'utf8')))
    .map((file) => relative(REPO_ROOT, file).split('\\').join('/'))
    .sort();
}

describe('the retired --agi-amber token', () => {
  it('is referenced only by the surfaces that still own it', () => {
    const allowed = new Set(ALLOWED.map((entry) => entry.file));
    const unexpected = referencingFiles().filter((file) => !allowed.has(file));

    expect(
      unexpected,
      'this token resolves to a blue in the product light scope; use --color-primary and --color-primary-foreground',
    ).toEqual([]);
  });

  it('has no allowlist entry that has stopped referencing it', () => {
    const referencing = new Set(referencingFiles());
    const stale = ALLOWED.map((entry) => entry.file).filter((file) => !referencing.has(file));

    expect(stale, 'drop these from the allowlist, the list may only shrink').toEqual([]);
  });

  it('is gone from every product surface that paints a primary action', () => {
    for (const file of [
      'apps/web/features/projects/components/SourcesPanel.tsx',
      'apps/web/features/projects/components/KnowledgeFilesPanel.tsx',
      'apps/web/features/projects/components/AddSourcesModal.tsx',
      'apps/web/app/chat/projects/page.tsx',
    ]) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      expect(RETIRED_TOKEN.test(source), `${file} still reads the retired token`).toBe(false);
    }
  });

  it('is defined by no stylesheet in the repository', () => {
    const defining = SEARCH_ROOTS.flatMap((root) => sourceFiles(join(REPO_ROOT, root)))
      .filter((file) => /--agi-amber(?:-soft)?\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO_ROOT, file).split('\\').join('/'));

    expect(
      defining,
      'the accent roles are --agi-accent, --agi-accent-text, --agi-accent-soft',
    ).toEqual([]);
  });
});
