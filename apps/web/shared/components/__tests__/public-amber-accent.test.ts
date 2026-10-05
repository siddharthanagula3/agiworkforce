import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import postcss from 'postcss';
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
const PUBLIC_TOKEN_ENTRY = '@agiworkforce/design-tokens/tailwind.css';
const PUBLIC_TOKENS = relative(REPO_ROOT, createRequire(__filename).resolve(PUBLIC_TOKEN_ENTRY))
  .split('\\')
  .join('/');
const PUBLIC_SYSTEM_DIR = 'apps/web/features/marketing/';

const OUTSIDE_PUBLIC_SCOPE_READERS: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'apps/web/features/support/components/SupportWidget.module.css',
    why: 'the widget renders under either an explicit marketing or product surface palette',
  },
  {
    file: 'packages/ui/ui/src/AgiMark.tsx',
    why: 'the mark defaults its accent prop to the token with a currentColor fallback',
  },
];

const LITERAL_FALLBACK_READERS = ['packages/ui/ui/src/AgiMark.tsx'] as const;

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

function tokenDefinitions(source: string, name: string) {
  const definitions: { selectors: string[]; value: string }[] = [];
  postcss.parse(source).walkDecls(name, (declaration) => {
    const parent = declaration.parent;
    if (parent?.type !== 'rule') throw new Error(`${name} must be defined in a public CSS rule`);
    definitions.push({ selectors: parent.selectors, value: declaration.value });
  });
  return definitions;
}

function assertReferenceAccent(source: string) {
  const dark = [
    "[data-design='agi'][data-public-reference]",
    "body:has([data-design='agi'][data-public-reference])",
  ];
  const light = [
    "html.light [data-design='agi'][data-public-reference]",
    "html[data-theme='light'] [data-design='agi'][data-public-reference]",
    "html.light body:has([data-design='agi'][data-public-reference])",
    "html[data-theme='light'] body:has([data-design='agi'][data-public-reference])",
  ];
  expect(tokenDefinitions(source, '--public-accent')).toEqual([
    { selectors: dark, value: 'var(--public-accent-dark)' },
    { selectors: light, value: 'var(--public-accent-light)' },
  ]);
  for (const token of ['--agi-amber', '--agi-accent', '--agi-accent-text']) {
    expect(
      tokenDefinitions(source, token),
      `${token} must resolve the selected public accent`,
    ).toEqual([
      { selectors: dark, value: 'var(--public-accent)' },
      { selectors: light, value: 'var(--public-accent)' },
    ]);
  }
  expect(tokenDefinitions(source, '--agi-amber-soft')).toEqual([]);
  for (const token of ['--public-accent-dark', '--public-accent-light']) {
    const definitions = tokenDefinitions(source, token);
    expect(definitions, `${token} must have one canonical palette value`).toHaveLength(1);
    expect(definitions[0]?.selectors).toEqual(dark);
    expect(definitions[0]?.value).toMatch(/^#[a-f\d]{6}$/i);
  }
}

describe('the public amber accent', () => {
  it('is defined only by the legacy public scope and the canonical reference token owner', () => {
    const defining = repoFiles()
      .filter((file) => AMBER_DEFINITION.test(file.source))
      .map((file) => file.path)
      .sort();

    expect(
      defining,
      'legacy public values remain in globals.css; reference aliases belong to the published design-token entrypoint',
    ).toEqual([GLOBALS, PUBLIC_TOKENS].sort());
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

  it('loads reference accent values only from the published canonical token owner', () => {
    const defining = repoFiles()
      .filter((file) => /--public-accent(?:-(?:light|dark))?\s*:/.test(file.source))
      .map((file) => file.path);
    expect(defining).toEqual([PUBLIC_TOKENS]);
    const globals = postcss.parse(readFileSync(join(REPO_ROOT, GLOBALS), 'utf8'));
    const imports: string[] = [];
    globals.walkAtRules('import', (rule) => {
      imports.push(rule.params.replace(/^(['"])(.*)\1$/, '$2'));
    });
    expect(imports).toContain(PUBLIC_TOKEN_ENTRY);
  });

  it('keeps both reference themes and portal inheritance scoped to their canonical accent aliases', () => {
    assertReferenceAccent(readFileSync(join(REPO_ROOT, PUBLIC_TOKENS), 'utf8'));
  });

  it.each([
    'wrong alias',
    'lost public scope',
    'unscoped duplicate',
    'unscoped soft alias',
  ] as const)('rejects a reference accent regression: %s', (regression) => {
    const source = readFileSync(join(REPO_ROOT, PUBLIC_TOKENS), 'utf8');
    const token = '--agi-amber';
    const invalid =
      regression === 'wrong alias'
        ? source.replace(`${token}: var(--public-accent)`, `${token}: var(--public-accent-dark)`)
        : regression === 'lost public scope'
          ? source.replace("[data-design='agi'][data-public-reference]", "[data-design='agi']")
          : regression === 'unscoped duplicate'
            ? `${source}\n:root { ${token}: var(--public-accent); }`
            : `${source}\n:root { ${token}-soft: var(--public-accent); }`;
    expect(invalid).not.toBe(source);
    expect(() => assertReferenceAccent(invalid)).toThrow();
  });

  it('is read only where the public design scope applies', () => {
    const outsidePublicScope = new Set(OUTSIDE_PUBLIC_SCOPE_READERS.map((entry) => entry.file));
    const unexpected = readingFiles()
      .filter((file) => file.path !== GLOBALS)
      .filter((file) => !outsidePublicScope.has(file.path))
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
    const stale = LITERAL_FALLBACK_READERS.filter((file) => {
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
