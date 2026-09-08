import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const SEARCH_ROOTS = ['apps/web', 'packages/ui'];
const SKIP_DIRS = /^(?:\.|node_modules$|\.next$|dist$|build$|coverage$|__snapshots__$)/;
const SOURCE_FILE = /\.(?:tsx?|css)$/;
const RETIRED_TOKEN = /--agi-amber\b/;

/**
 * `--agi-amber` is redefined three times in `apps/web/app/globals.css`: amber by
 * default, `#0a66b3` in the light scope the product pages render in, and a brown
 * in the warm and pearl stages. A product surface reading it therefore paints a
 * saturated blue primary action on a warm surface, which is what it did on the
 * project sources panel.
 *
 * The token's own comment has asked since it was retired that no new call site
 * reference it, and prose did not hold. This is that rule as a guard: the list
 * below may only shrink. Product UI uses `--color-primary` and
 * `--color-primary-foreground`, the pair the projects list already used for its
 * New button and the project page for its tab underline.
 */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'apps/web/features/marketing/components/legacy-landing.css',
    why: 'marketing, the surface the token was retired into and where the amber accent is the design',
  },
  {
    file: 'apps/web/features/marketing/components/system/system.css',
    why: 'marketing',
  },
  {
    file: 'apps/web/features/marketing/components/motion/motion.css',
    why: 'marketing',
  },
  {
    file: 'apps/web/features/support/components/SupportWidget.module.css',
    why: 'reads it with a literal fallback, so it survives the definitions being deleted',
  },
  {
    file: 'packages/ui/ui/src/AgiMark.tsx',
    why: 'reads it with a currentColor fallback for the mark on marketing grounds',
  },
  {
    file: 'apps/web/shared/components/__tests__/theme-contrast.test.ts',
    why: 'measures the token for the marketing stages',
  },
  {
    file: 'apps/web/shared/components/__tests__/retired-amber-token.test.ts',
    why: 'this guard',
  },
  {
    file: 'apps/web/app/globals.css',
    why: 'defines the token; the definitions stay while the marketing surfaces read them',
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

  it('keeps its definitions, because the marketing surfaces still read them', () => {
    const globals = readFileSync(join(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');
    expect(globals).toMatch(/--agi-amber:/);
  });
});
