import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

const SEARCH_ROOTS = ['apps/web', 'packages/ui'];
const SKIP_DIRS = /^(?:\.|node_modules$|\.next$|dist$|build$|coverage$|__snapshots__$)/;
const SOURCE_FILE = /\.(?:tsx?|css)$/;
const AMBER_TOKEN = /--agi-amber\b/;
const AMBER_WITH_FALLBACK = /var\(\s*--agi-amber(?:-soft)?\s*,/;
const AMBER_DEFINITION = /--agi-amber(?:-soft)?\s*:/;
const PUBLIC_SCOPE = /data-design=("agi"|'agi')|\[data-design='agi'\]/;

const GLOBALS = 'apps/web/app/globals.css';
const PUBLIC_SYSTEM_DIR = 'apps/web/features/marketing/';

/**
 * The amber accent is the public design system's one accent. The 28 August
 * flagship system was restored across every public page on 2026-09-11, so this
 * token is owned and current, not retired: `[data-design='agi']` carries the
 * dark value and `[data-theme='light'][data-design='agi']` the deepened value
 * that reads on the paper ground.
 *
 * Two things it must keep. Only those two blocks may define it, or one theme
 * silently inherits the other's value. And only the public design system may
 * read it, because outside `[data-design='agi']` the name resolves to nothing
 * and whatever it paints falls back to inherited colour.
 *
 * Product UI takes its accent from the `--chat-*` and `--color-*` roles, never
 * from here.
 */
const FALLBACK_READERS: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'apps/web/features/support/components/SupportWidget.module.css',
    why: 'the widget renders on public and product grounds, so it reads the name with a literal fallback',
  },
  {
    file: 'packages/ui/ui/src/AgiMark.tsx',
    why: 'the mark defaults its accent prop to the token with a currentColor fallback',
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.test(entry.name) ? [] : sourceFiles(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

function repoFiles(): { path: string; source: string }[] {
  return SEARCH_ROOTS.flatMap((root) => sourceFiles(join(REPO_ROOT, root))).map((file) => ({
    path: relative(REPO_ROOT, file).split('\\').join('/'),
    source: readFileSync(file, 'utf8'),
  }));
}

function readingFiles() {
  return repoFiles()
    .filter((file) => AMBER_TOKEN.test(file.source))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function blockSelectorsDefining(source: string): string[] {
  const selectors: string[] = [];
  let current = '';
  for (const line of source.split('\n')) {
    if (/\{\s*$/.test(line)) current = line.trim().replace(/\s*\{$/, '');
    else if (AMBER_DEFINITION.test(line)) selectors.push(current);
  }
  return [...new Set(selectors)];
}

describe('the public amber accent', () => {
  it('is defined by the public design scope in globals.css and nowhere else', () => {
    const defining = repoFiles()
      .filter((file) => AMBER_DEFINITION.test(file.source))
      .map((file) => file.path);

    expect(
      defining,
      'the public tokens live in the [data-design=agi] blocks of globals.css',
    ).toEqual([GLOBALS]);
  });

  it('carries both themes, so neither inherits the other value', () => {
    const globals = readFileSync(join(REPO_ROOT, GLOBALS), 'utf8');

    expect(blockSelectorsDefining(globals).sort()).toEqual([
      "[data-design='agi']",
      "[data-theme='light'][data-design='agi']",
    ]);

    for (const token of ['--agi-amber', '--agi-amber-soft']) {
      const definitions = globals.split('\n').filter((line) => line.trim().startsWith(`${token}:`));
      expect(definitions, `${token} needs a dark and a light value`).toHaveLength(2);
    }
  });

  it('is read only where the public design scope applies', () => {
    const fallback = new Set(FALLBACK_READERS.map((entry) => entry.file));
    const unexpected = readingFiles()
      .filter((file) => file.path !== GLOBALS)
      .filter((file) => !fallback.has(file.path))
      .filter((file) => !file.path.startsWith(PUBLIC_SYSTEM_DIR))
      .filter((file) => !PUBLIC_SCOPE.test(file.source))
      .map((file) => file.path);

    expect(
      unexpected,
      'outside [data-design=agi] this name resolves to nothing; product UI accents are --color-primary and the --chat-accent roles',
    ).toEqual([]);
  });

  it('has no fallback reader that has stopped reading it', () => {
    const reading = new Map(readingFiles().map((file) => [file.path, file.source]));
    const stale = FALLBACK_READERS.map((entry) => entry.file).filter((file) => {
      const source = reading.get(file);
      return source === undefined || !AMBER_WITH_FALLBACK.test(source);
    });

    expect(stale, 'a reader listed here must still read the name with a literal fallback').toEqual(
      [],
    );
  });

  it('is absent from every product surface that paints a primary action', () => {
    for (const file of [
      'apps/web/features/projects/components/SourcesPanel.tsx',
      'apps/web/features/projects/components/KnowledgeFilesPanel.tsx',
      'apps/web/features/projects/components/AddSourcesModal.tsx',
      'apps/web/app/chat/projects/page.tsx',
    ]) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      expect(AMBER_TOKEN.test(source), `${file} reads a public-page token`).toBe(false);
    }
  });
});
