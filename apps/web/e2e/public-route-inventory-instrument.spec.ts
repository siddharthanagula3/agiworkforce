import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { test, expect } from '@playwright/test';
import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';
import {
  enumeratePublicPages,
  getHelpArticleRoutePaths,
  getPublicRouteInventory,
  routeMatchesPattern,
  selectPublicRouteCases,
} from './lib/public-route-inventory';

const fixtureRoots: string[] = [];

function fixtureRoot(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'agi-public-route-inventory-'));
  fixtureRoots.push(directory);
  return directory;
}

function file(
  directory: string,
  relativeFile: string,
  source = 'export default function Page() { return null; }',
): string {
  const target = path.join(directory, relativeFile);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, source);
  return target;
}

function fixtureSupport(directory: string) {
  const supportDirectory = path.join(directory, 'support');
  const source =
    '---\nid: fixture-guide\ntitle: Fixture guide\npath: /help\ncategory: help\ntags: fixture\nupdated: 2026-10-04\nscope: public\n---\n\nOriginal body.\n';
  const markdown = file(supportDirectory, 'fixture-guide.md', source);
  const corpusFile = path.join(directory, 'corpus.json');
  execFileSync(
    process.execPath,
    [
      path.resolve(__dirname, '../scripts/build-support-corpus.mjs'),
      '--content',
      supportDirectory,
      '--out',
      corpusFile,
    ],
    { env: { NODE_ENV: 'test' }, stdio: 'pipe' },
  );
  return { supportDirectory, corpusFile, markdown, source };
}

function duringCorpusCheck(change: () => void, read: () => unknown): unknown {
  const original = childProcess.execFileSync;
  let changed = false;
  Object.defineProperty(childProcess, 'execFileSync', {
    value: (command: unknown, arguments_: unknown, options: unknown) => {
      if (
        !changed &&
        Array.isArray(arguments_) &&
        arguments_.includes('--check') &&
        arguments_.includes(path.resolve(__dirname, '../scripts/build-support-corpus.mjs'))
      ) {
        changed = true;
        change();
      }
      return Reflect.apply(original, childProcess, [command, arguments_, options]);
    },
  });
  syncBuiltinESMExports();
  try {
    return read();
  } finally {
    Object.defineProperty(childProcess, 'execFileSync', { value: original });
    syncBuiltinESMExports();
    expect(changed, 'The real corpus checker must have been intercepted').toBe(true);
  }
}

test.afterEach(() => {
  for (const directory of fixtureRoots.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test('new public pages enter the input without a roster edit', () => {
  const directory = fixtureRoot();
  file(directory, 'page.tsx');
  expect(enumeratePublicPages(directory).publicPages.map((page) => page.pattern)).toEqual(['/']);

  file(directory, 'new-public-proof/page.tsx');
  expect(enumeratePublicPages(directory).publicPages.map((page) => page.pattern)).toEqual([
    '/',
    '/new-public-proof',
  ]);
});

test('canonical product/auth predicates exclude their pages while segment neighbors remain public', () => {
  const directory = fixtureRoot();
  for (const relative of [
    'chat/page.tsx',
    'chat/nested/page.tsx',
    'login/page.tsx',
    'signup/page.tsx',
    'chatter/page.tsx',
    'dev/proof/page.tsx',
    'api/proof/page.tsx',
    '_private/page.tsx',
  ]) {
    file(directory, relative);
  }
  const result = enumeratePublicPages(directory);
  expect(result.publicPages.map((page) => page.pattern)).toEqual(['/chatter']);
  expect(
    result.excludedPages.filter((page) => isProductPath(page.pattern)).map((page) => page.pattern),
  ).toEqual(['/chat', '/chat/nested']);
  expect(
    result.excludedPages.filter((page) => isAuthPath(page.pattern)).map((page) => page.pattern),
  ).toEqual(['/login', '/signup']);
});

test('route groups normalize and parallel slots contribute to a single concrete route', () => {
  const directory = fixtureRoot();
  const { supportDirectory, corpusFile } = fixtureSupport(directory);
  file(directory, '(marketing)/about/page.tsx');
  file(directory, '(marketing)/about/@details/page.tsx');
  const pages = enumeratePublicPages(directory).publicPages;
  expect(pages.map((page) => page.pattern)).toEqual(['/about', '/about']);
  expect(pages.filter((page) => page.parallelSlot)).toHaveLength(1);
  expect(
    getPublicRouteInventory({
      appDirectory: directory,
      supportDirectory,
      corpusFile,
    }).fixedRoutes.map((route) => route.path),
  ).toEqual(['/about']);
});

test('conflicting group routes and malformed source fail rather than disappear', () => {
  const directory = fixtureRoot();
  file(directory, '(first)/about/page.tsx');
  file(directory, '(second)/about/page.tsx');
  expect(() => enumeratePublicPages(directory)).toThrow('Conflicting App Router pages');

  const invalid = fixtureRoot();
  file(invalid, 'page.tsx', 'export default function Page() { return <div>');
  expect(() => enumeratePublicPages(invalid)).toThrow('Cannot parse route inventory source');
});

test('aliased redirect-only stubs are excluded without executing them', () => {
  const directory = fixtureRoot();
  file(
    directory,
    'redirect/page.tsx',
    "import { redirect as go } from 'next/navigation'; export default function Page() { go('/target'); }",
  );
  file(directory, 'content/page.tsx');
  const result = enumeratePublicPages(directory);
  expect(result.publicPages.map((page) => page.pattern)).toEqual(['/content']);
  expect(result.excludedPages.map((page) => [page.pattern, page.reason])).toEqual([
    ['/redirect', 'redirect-only'],
  ]);
});

test('new dynamic pages remain visible as unresolved coverage', () => {
  const directory = fixtureRoot();
  const { supportDirectory, corpusFile } = fixtureSupport(directory);
  file(directory, 'news/[slug]/page.tsx');
  const result = getPublicRouteInventory({
    appDirectory: directory,
    supportDirectory,
    corpusFile,
  });
  expect(result.routes).toEqual([]);
  expect(result.patterns).toEqual(['/news/[slug]']);
  expect(result.unresolvedDynamic.map((route) => route.pattern)).toEqual(['/news/[slug]']);
  expect(result.unresolvedDynamic.map((route) => route.stateSamples)).toEqual([
    [
      expect.objectContaining({
        path: null,
        dataAccess: 'fixture-required',
        state: 'successful-content',
      }),
    ],
  ]);
});

test('corpus disagreement is detected even when document IDs are unchanged', () => {
  const directory = fixtureRoot();
  const { supportDirectory: content, corpusFile, markdown, source } = fixtureSupport(directory);
  expect(getHelpArticleRoutePaths({ supportDirectory: content, corpusFile })).toEqual([
    '/help/fixture-guide',
  ]);
  writeFileSync(markdown, source.replace('Original body.', 'Changed body.'));
  expect(() => getHelpArticleRoutePaths({ supportDirectory: content, corpusFile })).toThrow(
    'Support corpus disagrees',
  );
});

test('corpus replacement during its checker is rejected', async () => {
  const directory = fixtureRoot();
  const fixture = fixtureSupport(directory);
  const before = readFileSync(fixture.corpusFile, 'utf8');
  let returned: unknown;
  let failure: unknown;
  try {
    returned = duringCorpusCheck(
      () => {
        writeFileSync(
          fixture.markdown,
          fixture.source.replace('id: fixture-guide', 'id: newer-guide'),
        );
        execFileSync(
          process.execPath,
          [
            path.resolve(__dirname, '../scripts/build-support-corpus.mjs'),
            '--content',
            fixture.supportDirectory,
            '--out',
            fixture.corpusFile,
          ],
          { env: { NODE_ENV: 'test' }, stdio: 'pipe' },
        );
      },
      () => getHelpArticleRoutePaths(fixture),
    );
  } catch (error) {
    failure = error;
  }
  await test.info().attach('corpus-snapshot-witness.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          before,
          after: readFileSync(fixture.corpusFile, 'utf8'),
          returned,
          error: failure instanceof Error ? failure.message : failure,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
  expect(() => {
    if (failure) throw failure;
    return returned;
  }).toThrow('Support sources changed during validation');
});

test('matching corpus bytes cannot hide Markdown changes during validation', () => {
  const directory = fixtureRoot();
  const fixture = fixtureSupport(directory);
  const corpus = readFileSync(fixture.corpusFile, 'utf8');
  expect(() =>
    duringCorpusCheck(
      () => {
        writeFileSync(fixture.markdown, fixture.source + '\nA changed body.\n');
        writeFileSync(fixture.markdown, fixture.source);
      },
      () => getHelpArticleRoutePaths(fixture),
    ),
  ).toThrow('Support sources changed during validation');
  expect(readFileSync(fixture.corpusFile, 'utf8')).toBe(corpus);
  expect(readFileSync(fixture.markdown, 'utf8')).toBe(fixture.source);
});

test('a checker failure cannot hide an input replacement', () => {
  const directory = fixtureRoot();
  const fixture = fixtureSupport(directory);
  expect(() =>
    duringCorpusCheck(
      () => writeFileSync(fixture.markdown, fixture.source + '\nA changed body.\n'),
      () => getHelpArticleRoutePaths(fixture),
    ),
  ).toThrow('Support sources changed during validation');
});

const terminalFixtures = [
  {
    name: 'not-found',
    file: 'share/[token]/page.tsx',
    indirect: '(() => notFound());',
    direct: 'notFound();',
    source: `import { notFound } from 'next/navigation';
      import { SHARE_TOKEN_REGEX } from '@/lib/services/org-shared-session-service';
      export async function generateMetadata({ params }) {
        const { token } = await params;
        if (!SHARE_TOKEN_REGEX.test(token)) return { title: 'Unavailable' };
        return { title: 'Shared content' };
      }
      export default async function Page({ params }) {
        const { token } = await params;
        if (!SHARE_TOKEN_REGEX.test(token)) (() => notFound());
        return readPrivateData();
      }`,
  },
  {
    name: 'null-return',
    file: 'share/schedules/[token]/page.tsx',
    indirect: '(() => { return null; });',
    direct: 'return (null);',
    source: `import { notFound } from 'next/navigation';
      import { MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN } from '@agiworkforce/cloud-contracts';
      async function readShare(token) {
        if (!MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN.test(token)) (() => { return null; });
        return readPrivateData();
      }
      export async function generateMetadata({ params }) {
        const share = await readShare((await params).token);
        return { title: share ? 'Shared schedule' : 'Unavailable' };
      }
      export default async function Page({ params }) {
        const { token } = await params;
        const share = await readShare(token);
        if (!share) notFound();
        return null;
      }`,
  },
  {
    name: 'unavailable-artifact',
    file: 'shared-artifact/[token]/page.tsx',
    indirect: 'return () => <UnavailableArtifact />;',
    direct: 'return (<UnavailableArtifact />);',
    source: `import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';
      import { UnavailableArtifact } from './UnavailableArtifact';
      export async function generateMetadata({ params }) {
        const { token } = await params;
        if (!PUBLISHED_TOKEN_REGEX.test(token)) return { title: 'Unavailable' };
        return { title: 'Shared content' };
      }
      export default async function Page({ params }) {
        const { token } = await params;
        if (!PUBLISHED_TOKEN_REGEX.test(token)) return () => <UnavailableArtifact />;
        return readPrivateData();
      }`,
  },
];

function tokenFixture(name: string): { file: string; source: string } {
  const fixture = terminalFixtures.find((candidate) => candidate.name === name);
  if (!fixture) throw new Error(`No terminal fixture: ${name}`);
  return { file: fixture.file, source: fixture.source.replace(fixture.indirect, fixture.direct) };
}

async function executeTokenFixture(source: string) {
  const directory = realpathSync(fixtureRoot());
  file(
    directory,
    'counter.cjs',
    `let reads = 0;
    exports.readPrivateData = () => { reads += 1; return null; };
    exports.count = () => reads;`,
  );
  for (const [module, body] of [
    [
      'node_modules/next/navigation.js',
      "exports.notFound = () => { throw new Error('fixture-not-found'); };",
    ],
    [
      'node_modules/@/lib/services/org-shared-session-service.js',
      'exports.SHARE_TOKEN_REGEX = /^validated-token$/;',
    ],
    [
      'node_modules/@agiworkforce/cloud-contracts/index.js',
      'exports.MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN = /^validated-token$/;',
    ],
    [
      'node_modules/@/lib/services/published-artifact-service.js',
      'exports.PUBLISHED_TOKEN_REGEX = /^validated-token$/;',
    ],
    ['UnavailableArtifact.js', 'exports.UnavailableArtifact = () => null;'],
    ['node_modules/react/jsx-runtime.js', 'exports.jsx = (component) => component();'],
  ] as const)
    file(directory, module, body);
  const compiled = ts.transpileModule(
    `import { readPrivateData } from './counter.cjs';\n${source}`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  file(directory, 'fixture.cjs', compiled);
  const runner = file(
    directory,
    'runner.cjs',
    `const counter = require('./counter.cjs');
    const page = require('./fixture.cjs');
    const moduleReads = counter.count();
    async function run() {
      let terminal;
      try {
        if (typeof page.default !== 'function') throw new Error('Controlled fixture has no page function');
        await page.default({ params: Promise.resolve({ token: 'inventory-invalid-token!' }) });
      } catch (error) {
        terminal = error instanceof Error ? error.message : String(error);
      }
      process.stdout.write(JSON.stringify({ moduleReads, pageReads: counter.count() - moduleReads, terminal }));
    }
    run().catch((error) => { process.stderr.write(String(error)); process.exitCode = 1; });`,
  );
  return JSON.parse(
    execFileSync(
      process.execPath,
      ['--permission', `--allow-fs-read=${directory}`, '--no-addons', runner],
      { cwd: directory, env: { NODE_ENV: 'test' }, encoding: 'utf8', stdio: 'pipe', timeout: 5000 },
    ),
  );
}

async function bindingWitness(source: string) {
  const witness = await executeTokenFixture(source);
  await test.info().attach('controlled-execution.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          source,
          executionScope:
            'Authored fixture modules in a disposable Node child; the JSX adapter directly calls the fixture component. No production imports or general side-effect isolation is proven.',
          ...witness,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
  return witness;
}

for (const counterexample of [
  {
    name: 'validator',
    fixture: 'not-found',
    transform: (source: string) =>
      source.replace(
        "import { SHARE_TOKEN_REGEX } from '@/lib/services/org-shared-session-service';",
        "import { SHARE_TOKEN_REGEX as importedValidator } from '@/lib/services/org-shared-session-service'; const SHARE_TOKEN_REGEX = { test: () => true };",
      ),
  },
  {
    name: 'notFound',
    fixture: 'not-found',
    transform: (source: string) =>
      source.replace(
        "import { notFound } from 'next/navigation';",
        "import { notFound as importedNotFound } from 'next/navigation'; function notFound() {}",
      ),
  },
  {
    name: 'UnavailableArtifact',
    fixture: 'unavailable-artifact',
    transform: (source: string) =>
      source.replace(
        "import { UnavailableArtifact } from './UnavailableArtifact';",
        "import { UnavailableArtifact as importedUnavailable } from './UnavailableArtifact'; function UnavailableArtifact() { return readPrivateData(); }",
      ),
  },
  {
    name: 'locally shadowed validator',
    fixture: 'not-found',
    transform: (source: string) =>
      source.replace(
        'export default async function Page({ params }) {',
        'export default async function Page({ params }) { const SHARE_TOKEN_REGEX = { test: () => true };',
      ),
  },
]) {
  test(`binding proof rejects a substituted ${counterexample.name}`, async () => {
    const directory = fixtureRoot();
    const support = fixtureSupport(directory);
    const fixture = tokenFixture(counterexample.fixture);
    const source = counterexample.transform(fixture.source);
    const witness = await bindingWitness(source);
    expect(witness.pageReads).toBe(1);
    file(directory, fixture.file, source);
    expect(() => getPublicRouteInventory({ appDirectory: directory, ...support })).toThrow(
      'Malformed-token binding',
    );
  });
}

test('schedule entry cannot read private data before its guarded reader', async () => {
  const directory = fixtureRoot();
  const support = fixtureSupport(directory);
  const fixture = tokenFixture('null-return');
  const source = fixture.source.replace(
    'export default async function Page({ params }) {',
    'export default async function Page({ params }) { readPrivateData();',
  );
  expect((await bindingWitness(source)).pageReads).toBe(1);
  file(directory, fixture.file, source);
  expect(() => getPublicRouteInventory({ appDirectory: directory, ...support })).toThrow(
    'Malformed-token schedule entry',
  );
});

test('schedule reader binding cannot be shadowed by a later class', async () => {
  const directory = fixtureRoot();
  const support = fixtureSupport(directory);
  const fixture = tokenFixture('null-return');
  const source = fixture.source.replace(
    'if (!share) notFound();',
    'if (!share) notFound(); class readShare {}',
  );
  const witness = await bindingWitness(source);
  expect(witness.pageReads).toBe(0);
  expect(witness.terminal).toContain("Cannot access 'readShare' before initialization");
  file(directory, fixture.file, source);
  expect(() => getPublicRouteInventory({ appDirectory: directory, ...support })).toThrow(
    'Malformed-token binding shadows its guarded reader',
  );
});

test('module initialization stays outside a handler guard proof', async () => {
  const directory = fixtureRoot();
  const support = fixtureSupport(directory);
  const fixture = tokenFixture('not-found');
  const source = 'const initialized = readPrivateData();\n' + fixture.source;
  expect(await bindingWitness(source)).toEqual({
    moduleReads: 1,
    pageReads: 0,
    terminal: 'fixture-not-found',
  });
  file(directory, fixture.file, source);
  const samples = getPublicRouteInventory({ appDirectory: directory, ...support }).stateSamples;
  expect(samples).toContainEqual(
    expect.objectContaining({
      state: 'not-found',
      dataAccess: 'handler-guarded',
      unresolvedFlags: expect.arrayContaining([
        'module-initializers-unverified',
        'import-side-effects-unverified',
      ]),
    }),
  );
  expect(samples.map((sample) => sample.dataAccess)).not.toContain('none');
});

test('side-effect import stays outside a handler guard proof', async () => {
  const directory = fixtureRoot();
  const support = fixtureSupport(directory);
  const fixture = tokenFixture('not-found');
  const source = "import './read-private-data.mjs';\n" + fixture.source;
  const moduleFile = file(
    directory,
    'read-private-data.mjs',
    'globalThis.fixturePrivateReads = 1;',
  );
  const witness = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(moduleFile)}); process.stdout.write(JSON.stringify({ importReads: globalThis.fixturePrivateReads }));`,
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    ),
  );
  await test.info().attach('controlled-import.json', {
    body: Buffer.from(JSON.stringify({ source, witness }, null, 2)),
    contentType: 'application/json',
  });
  expect(witness.importReads).toBe(1);
  file(directory, fixture.file, source);
  expect(
    getPublicRouteInventory({ appDirectory: directory, ...support }).stateSamples,
  ).toContainEqual(
    expect.objectContaining({
      state: 'not-found',
      dataAccess: 'handler-guarded',
      unresolvedFlags: expect.arrayContaining(['import-side-effects-unverified']),
    }),
  );
});

test('current canonical token handlers remain recognized without executing their imports', () => {
  const directory = fixtureRoot();
  const support = fixtureSupport(directory);
  for (const fixture of terminalFixtures) {
    file(
      directory,
      fixture.file,
      readFileSync(path.resolve(__dirname, '../app', fixture.file), 'utf8'),
    );
  }
  const samples = getPublicRouteInventory({ appDirectory: directory, ...support }).stateSamples;
  const guarded = samples.filter((sample) => sample.dataAccess === 'handler-guarded');
  expect(guarded.map((sample) => sample.pattern).sort()).toEqual([
    '/share/[token]',
    '/share/schedules/[token]',
    '/shared-artifact/[token]',
  ]);
  for (const sample of guarded) {
    expect(sample.unresolvedFlags).toEqual(
      expect.arrayContaining([
        'module-initializers-unverified',
        'import-side-effects-unverified',
        'transitive-bindings-unverified',
        'parameter-and-expression-evaluation-unverified',
        'render-execution-unverified',
      ]),
    );
    expect(sample.source).toContain('full route execution is unverified');
  }
  expect(samples.map((sample) => sample.dataAccess)).not.toContain('none');
});

test('caller samples cannot grant themselves a handler or data-free proof', () => {
  const directory = fixtureRoot();
  const support = fixtureSupport(directory);
  file(directory, 'news/[slug]/page.tsx');
  for (const claimed of ['none', 'handler-guarded', undefined]) {
    const sample = {
      pattern: '/news/[slug]',
      path: '/news/fixture',
      state: 'successful-content',
      expectedHttpStatuses: [200] as const,
      dataAccess: 'fixture-required' as const,
      source: 'test-owned fixture',
      unresolvedFlags: [],
    };
    Object.defineProperty(sample, 'dataAccess', { value: claimed });
    expect(() =>
      getPublicRouteInventory({ appDirectory: directory, ...support, stateSamples: [sample] }),
    ).toThrow('Invalid state data-access proof scope');
  }
});

for (const fixture of terminalFixtures) {
  test(`uninvoked ${fixture.name} callbacks cannot establish a terminal malformed-token state`, () => {
    const directory = fixtureRoot();
    const { supportDirectory, corpusFile } = fixtureSupport(directory);
    file(directory, fixture.file, fixture.source);
    expect(() =>
      getPublicRouteInventory({ appDirectory: directory, supportDirectory, corpusFile }),
    ).toThrow('Malformed-token guard no longer reaches its declared state');
  });

  test(`direct ${fixture.name} terminals establish a malformed-token state`, () => {
    const directory = fixtureRoot();
    const { supportDirectory, corpusFile } = fixtureSupport(directory);
    file(directory, fixture.file, fixture.source.replace(fixture.indirect, fixture.direct));
    const inventory = getPublicRouteInventory({
      appDirectory: directory,
      supportDirectory,
      corpusFile,
    });
    expect(
      inventory.stateSamples.filter((sample) => sample.dataAccess === 'handler-guarded'),
    ).toEqual([
      expect.objectContaining({
        path: expect.stringContaining('inventory-invalid-token'),
        dataAccess: 'handler-guarded',
        unresolvedFlags: expect.arrayContaining([
          'module-initializers-unverified',
          'import-side-effects-unverified',
          'render-execution-unverified',
        ]),
      }),
    ]);
    expect(
      inventory.stateSamples.filter((sample) => sample.dataAccess === 'fixture-required'),
    ).toEqual([
      expect.objectContaining({
        path: null,
        state: 'successful-content',
        unresolvedFlags: expect.arrayContaining(['successful-local-data-unavailable']),
      }),
    ]);
  });
}

test('malformed token samples fail if metadata reads data before validation', () => {
  const directory = fixtureRoot();
  const { supportDirectory, corpusFile } = fixtureSupport(directory);
  const source = `import { notFound } from 'next/navigation';
    import { SHARE_TOKEN_REGEX } from '@/lib/services/org-shared-session-service';
    export async function generateMetadata({ params }) {
      const { token } = await params;
      if (!SHARE_TOKEN_REGEX.test(token)) return { title: 'Unavailable' };
      return { title: 'Shared content' };
    }
    export default async function Page({ params }) {
      const { token } = await params;
      if (!SHARE_TOKEN_REGEX.test(token)) notFound();
      return null;
    }`;
  const page = file(directory, 'share/[token]/page.tsx', source);
  expect(
    getPublicRouteInventory({
      appDirectory: directory,
      supportDirectory,
      corpusFile,
    }).stateSamples,
  ).toContainEqual(
    expect.objectContaining({
      state: 'not-found',
      dataAccess: 'handler-guarded',
      expectedHttpStatuses: [200, 404],
      expectedNotFoundUi: true,
      expectedRobots: 'noindex',
    }),
  );
  writeFileSync(
    page,
    source.replace(
      'export async function generateMetadata({ params }) {',
      'export async function generateMetadata({ params }) { readPrivateData();',
    ),
  );
  expect(() =>
    getPublicRouteInventory({
      appDirectory: directory,
      supportDirectory,
      corpusFile,
    }),
  ).toThrow('may access data before its guard');
});

test('catch-all matching and explicit fixture samples preserve route scope', () => {
  expect(routeMatchesPattern('/directory/[...id]', '/directory/provider/server')).toBe(true);
  expect(routeMatchesPattern('/directory/[...id]', '/directory')).toBe(false);
  expect(routeMatchesPattern('/directory/[[...id]]', '/directory')).toBe(true);
  expect(routeMatchesPattern('/directory/[id]', '/directory/provider/server')).toBe(false);
  const directory = fixtureRoot();
  const { supportDirectory, corpusFile } = fixtureSupport(directory);
  file(directory, 'news/[slug]/page.tsx');
  const sample = {
    pattern: '/news/[slug]',
    path: '/news/local-fixture',
    state: 'successful-content',
    expectedHttpStatuses: [200] as const,
    dataAccess: 'fixture-required' as const,
    source: 'test-owned local fixture',
  };
  expect(
    getPublicRouteInventory({
      appDirectory: directory,
      supportDirectory,
      corpusFile,
      stateSamples: [sample],
    }).stateSamples,
  ).toContainEqual(expect.objectContaining(sample));
  expect(() =>
    getPublicRouteInventory({
      appDirectory: directory,
      supportDirectory,
      corpusFile,
      stateSamples: [{ ...sample, path: '/other/local-fixture' }],
    }),
  ).toThrow('State sample does not match');
  expect(readFileSync(path.join(directory, 'news/[slug]/page.tsx'), 'utf8')).toContain(
    'return null',
  );
});

test('invalid transport status arrays fail in supplied states and selected cases', () => {
  const directory = fixtureRoot();
  const { supportDirectory, corpusFile } = fixtureSupport(directory);
  file(directory, 'news/[slug]/page.tsx');
  const sample = {
    pattern: '/news/[slug]',
    path: '/news/local-fixture',
    state: 'successful-content',
    expectedHttpStatuses: [200] as const,
    dataAccess: 'fixture-required' as const,
    source: 'test-owned local fixture',
  };
  for (const invalid of [[], [99], [600], [200.5], [200, 200], ['200'], undefined, 200]) {
    const untrustedSample = { ...sample };
    Object.defineProperty(untrustedSample, 'expectedHttpStatuses', { value: invalid });
    expect(() =>
      getPublicRouteInventory({
        appDirectory: directory,
        supportDirectory,
        corpusFile,
        stateSamples: [untrustedSample],
      }),
    ).toThrow('Invalid expected HTTP statuses');
  }
  const inventory = getPublicRouteInventory({
    appDirectory: directory,
    supportDirectory,
    corpusFile,
  });
  file(directory, 'fixed/page.tsx');
  const fixedInventory = getPublicRouteInventory({
    appDirectory: directory,
    supportDirectory,
    corpusFile,
  });
  const fixedRoute = fixedInventory.routes[0];
  if (!fixedRoute) throw new Error('Fixed-route fixture was not enumerated');
  Object.defineProperty(fixedRoute, 'expectedHttpStatuses', { value: [] });
  expect(() => selectPublicRouteCases(fixedInventory)).toThrow('Invalid expected HTTP statuses');
  expect(inventory.stateSamples.map((state) => state.expectedHttpStatuses)).toEqual([null]);
});
