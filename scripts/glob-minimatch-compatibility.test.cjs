'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { after, test } = require('node:test');

const root = process.cwd();
const rootRequire = createRequire(path.join(root, 'package.json'));
const desktopRequire = createRequire(path.join(root, 'apps/desktop/package.json'));
const mobileRequire = createRequire(path.join(root, 'apps/mobile/package.json'));
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const installedDirectory = fs.realpathSync(path.join(root, 'node_modules'));
function installedEntry(request, name) {
  const entry = fs.realpathSync(request.resolve(name));
  assert.ok(
    entry.startsWith(installedDirectory + path.sep),
    name + ' must resolve inside this workspace',
  );
  return entry;
}
const from = (request, name) => createRequire(installedEntry(request, name));
const detoxRequire = from(mobileRequire, 'detox');
const mvRequire = from(from(detoxRequire, 'bunyan'), 'mv');
const legacyRimrafRequire = from(mvRequire, 'rimraf');
const tempRequire = from(detoxRequire, 'temp');
const appBuilderRequire = from(from(desktopRequire, 'electron-builder'), 'app-builder-lib');
const asarEntry = installedEntry(appBuilderRequire, '@electron/asar');
const asarRequire = createRequire(asarEntry);
const jakeRequire = from(from(appBuilderRequire, 'ejs'), 'jake');
const filelistEntry = installedEntry(jakeRequire, 'filelist');
const frameworkManifestPath = installedEntry(desktopRequire, '@wdio/mocha-framework/package.json');
const frameworkRequire = createRequire(frameworkManifestPath);
const frameworkManifest = JSON.parse(fs.readFileSync(frameworkManifestPath, 'utf8'));
const frameworkExport = frameworkManifest.exports['.'].import;
assert.equal(typeof frameworkExport, 'string', 'WDIO must declare its public ESM entry');
const frameworkEntry = path.resolve(path.dirname(frameworkManifestPath), frameworkExport);
const jestConfigRequire = from(from(from(mobileRequire, 'jest'), '@jest/core'), 'jest-config');
const istanbulRequire = from(from(jestConfigRequire, 'babel-jest'), 'babel-plugin-istanbul');
const testExcludeEntry = installedEntry(istanbulRequire, 'test-exclude');
const e2bRequire = from(from(webRequire, '@e2b/code-interpreter'), 'e2b');
const modernGlobEntry = installedEntry(e2bRequire, 'glob');
const modernGlobRequire = createRequire(modernGlobEntry);
const minimatchEntry = installedEntry(modernGlobRequire, 'minimatch');
const legacy = [
  { major: '6', entry: installedEntry(legacyRimrafRequire, 'glob') },
  { major: '7', entry: installedEntry(asarRequire, 'glob') },
  { major: '8', entry: installedEntry(detoxRequire, 'glob') },
];
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agi-glob-minimatch-')));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const fixtureFiles = [
  'top.txt',
  '.hidden',
  '.hidden.md',
  'src/index.js',
  'src/app.ts',
  'src/.hidden.ts',
  'src/.secret/private.ts',
  'src/nested/child.ts',
  'src/a.test.js',
  'src/space name.ts',
  'src/café.ts',
  'lib/main.js',
  'lib/main.test.js',
  'lib/[name].ts',
  'lib/.hidden.js',
];
const legacyCases = [
  {
    pattern: '**/*',
    options: {
      nodir: true,
    },
    expected: [
      'lib/[name].ts',
      'lib/main.js',
      'lib/main.test.js',
      'linked/a.test.js',
      'linked/app.ts',
      'linked/café.ts',
      'linked/index.js',
      'linked/space name.ts',
      'src/a.test.js',
      'src/app.ts',
      'src/café.ts',
      'src/index.js',
      'src/nested/child.ts',
      'src/space name.ts',
      'top.txt',
    ],
  },
  {
    pattern: '**/*.@(js|ts)',
    options: {
      nodir: true,
    },
    expected: [
      'lib/[name].ts',
      'lib/main.js',
      'lib/main.test.js',
      'linked/a.test.js',
      'linked/app.ts',
      'linked/café.ts',
      'linked/index.js',
      'linked/space name.ts',
      'src/a.test.js',
      'src/app.ts',
      'src/café.ts',
      'src/index.js',
      'src/nested/child.ts',
      'src/space name.ts',
    ],
  },
  {
    pattern: '{src,lib}/**/*.{js,ts}',
    options: {
      nodir: true,
    },
    expected: [
      'lib/[name].ts',
      'lib/main.js',
      'lib/main.test.js',
      'src/a.test.js',
      'src/app.ts',
      'src/café.ts',
      'src/index.js',
      'src/nested/child.ts',
      'src/space name.ts',
    ],
  },
  {
    pattern: '**/*.js',
    options: {
      nodir: true,
      ignore: '**/*.test.js',
    },
    expected: ['lib/main.js', 'linked/index.js', 'src/index.js'],
  },
  {
    pattern: '**/*',
    options: {
      nodir: true,
      ignore: ['src/**', 'lib/main.test.js'],
    },
    expected: [
      'lib/[name].ts',
      'lib/main.js',
      'linked/a.test.js',
      'linked/app.ts',
      'linked/café.ts',
      'linked/index.js',
      'linked/space name.ts',
      'top.txt',
    ],
  },
  {
    pattern: '**/*',
    options: {
      nodir: true,
      dot: true,
    },
    expected: [
      '.hidden',
      '.hidden.md',
      'lib/.hidden.js',
      'lib/[name].ts',
      'lib/main.js',
      'lib/main.test.js',
      'linked/.hidden.ts',
      'linked/a.test.js',
      'linked/app.ts',
      'linked/café.ts',
      'linked/index.js',
      'linked/space name.ts',
      'src/.hidden.ts',
      'src/.secret/private.ts',
      'src/a.test.js',
      'src/app.ts',
      'src/café.ts',
      'src/index.js',
      'src/nested/child.ts',
      'src/space name.ts',
      'top.txt',
    ],
  },
  {
    pattern: '*',
    options: {},
    expected: ['lib', 'linked', 'src', 'top.txt'],
  },
  {
    pattern: '.*',
    options: {},
    expected: ['.hidden', '.hidden.md'],
  },
  {
    pattern: '[.]hidden',
    options: {},
    expected: {
      6: ['.hidden'],
      7: ['.hidden'],
      8: [],
    },
  },
  {
    pattern: '@(.hidden|top.txt)',
    options: {},
    expected: ['top.txt'],
  },
  {
    pattern: '?(.hidden|top.txt)',
    options: {},
    expected: ['top.txt'],
  },
  {
    pattern: '.hidden*',
    options: {},
    expected: ['.hidden', '.hidden.md'],
  },
  {
    pattern: '**/.*',
    options: {},
    expected: [
      '.hidden',
      '.hidden.md',
      'lib/.hidden.js',
      'linked/.hidden.ts',
      'linked/.secret',
      'src/.hidden.ts',
      'src/.secret',
    ],
  },
  {
    pattern: '**/.hidden.ts',
    options: {},
    expected: ['linked/.hidden.ts', 'src/.hidden.ts'],
  },
  {
    pattern: '[.]hidden',
    options: {
      nonull: true,
    },
    expected: {
      6: ['.hidden'],
      7: ['.hidden'],
      8: ['[.]hidden'],
    },
    events: {
      6: ['.hidden'],
      7: ['.hidden'],
      8: [],
    },
  },
  {
    pattern: '@(.hidden)',
    options: {
      nonull: true,
    },
    expected: ['@(.hidden)'],
    events: [],
  },
  {
    pattern: '\\.hidden',
    options: {},
    expected: {
      6: ['.hidden'],
      7: [],
      8: ['.hidden'],
    },
  },
  {
    pattern: '**/*.ts',
    options: {
      dot: true,
      ignore: '**/.secret/**',
    },
    expected: [
      'lib/[name].ts',
      'linked/.hidden.ts',
      'linked/app.ts',
      'linked/café.ts',
      'linked/space name.ts',
      'src/.hidden.ts',
      'src/app.ts',
      'src/café.ts',
      'src/nested/child.ts',
      'src/space name.ts',
    ],
  },
  {
    pattern: 'src\\**\\*.ts',
    options: {
      windowsPathsNoEscape: true,
      nodir: true,
    },
    expected: ['src/app.ts', 'src/café.ts', 'src/nested/child.ts', 'src/space name.ts'],
  },
  {
    pattern: 'SRC/**/*.TS',
    options: {
      nocase: true,
      nodir: true,
    },
    expected: ['src/app.ts', 'src/café.ts', 'src/nested/child.ts', 'src/space name.ts'],
  },
  {
    pattern: '**/*.ts',
    options: {
      follow: true,
      nodir: true,
    },
    expected: [
      'lib/[name].ts',
      'linked/app.ts',
      'linked/café.ts',
      'linked/nested/child.ts',
      'linked/space name.ts',
      'src/app.ts',
      'src/café.ts',
      'src/nested/child.ts',
      'src/space name.ts',
    ],
  },
  {
    pattern: 'src/**/*',
    options: {
      mark: true,
    },
    expected: [
      'src/a.test.js',
      'src/app.ts',
      'src/café.ts',
      'src/index.js',
      'src/nested/',
      'src/nested/child.ts',
      'src/space name.ts',
    ],
  },
  {
    pattern: 'src/**/*.ts',
    options: {
      realpath: true,
      nodir: true,
    },
    expected: [
      '$ROOT/src/app.ts',
      '$ROOT/src/café.ts',
      '$ROOT/src/nested/child.ts',
      '$ROOT/src/space name.ts',
    ],
    events: ['src/app.ts', 'src/café.ts', 'src/nested/child.ts', 'src/space name.ts'],
  },
];

function fixture(name) {
  const directory = path.join(temporary, name);
  fs.mkdirSync(directory);
  for (const file of fixtureFiles) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), 'module.exports = true;\n');
  }
  fs.symlinkSync(
    process.platform === 'win32' ? path.join(directory, 'src') : 'src',
    path.join(directory, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return directory;
}

const sorted = (values) => [...values].sort();

function expected(specification, major, directory) {
  const values = Array.isArray(specification) ? specification : specification[major];
  assert.ok(Array.isArray(values), 'The captured legacy expectation must exist');
  const absolute = fs.realpathSync(directory).replaceAll('\\', '/');
  return values.map((value) => value.replace('$ROOT', absolute));
}

function callbackGlob(glob, pattern, options) {
  return new Promise((resolve, reject) => {
    let calls = 0;
    glob(pattern, options, (error, values) => {
      assert.equal(++calls, 1);
      error ? reject(error) : resolve(values);
    });
  });
}

for (const { major, entry } of legacy) {
  const glob = require(entry);
  const directory = fixture('legacy-' + major);
  test('legacy glob' + major + ' preserves sync, callback and match-event semantics', async () => {
    for (const row of legacyCases) {
      const options = { cwd: directory, ...row.options };
      const values = expected(row.expected, major, directory);
      assert.deepEqual(sorted(glob.sync(row.pattern, options)), values, row.pattern);
      assert.deepEqual(sorted(await callbackGlob(glob, row.pattern, options)), values, row.pattern);
      const events = [];
      await new Promise((resolve, reject) => {
        new glob.Glob(row.pattern, options)
          .on('match', (value) => events.push(value))
          .on('error', reject)
          .on('end', resolve);
      });
      assert.deepEqual(
        sorted(events),
        expected(row.events ?? row.expected, major, directory),
        row.pattern,
      );
    }
    assert.throws(() => glob.sync(null), /^Error: must provide pattern$/);
  });

  test('legacy glob' + major + ' stops matches after explicit abort', async () => {
    let afterAbort = 0;
    let aborted = false;
    await new Promise((resolve, reject) => {
      const stream = new glob.Glob('**/*', { cwd: directory, dot: true });
      stream.on('error', reject);
      stream.on('match', () => {
        if (aborted) {
          afterAbort += 1;
        } else {
          aborted = true;
          stream.abort();
          setTimeout(resolve, 75);
        }
      });
    });
    assert.equal(aborted, true);
    assert.equal(afterAbort, 0);
  });
}

test('minimatch bounds amplification and large-set preprocessing', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      [
        "const assert = require('node:assert/strict');",
        'const { Minimatch } = require(process.argv[1]);',
        "const pattern = Array(8).fill('**/../a/b').join('/');",
        'assert.equal(new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 16 }).set.length, 16);',
        "const large = new Minimatch('{x,*}/{0..999}', { optimizationLevel: 2 });",
        'assert.equal(large.set.length, 2000);',
        "assert.equal(large.match('x/5'), true);",
        "assert.equal(large.match('y/999'), true);",
        "assert.equal(large.match('.y/5'), false);",
      ].join('\n'),
      minimatchEntry,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const minimatch = require(minimatchEntry);
  const cases = [
    ['src/index.ts', 'src/**/*.@(js|ts)', {}, true],
    ['src/.hidden.ts', 'src/**/*.ts', {}, false],
    ['src/.hidden.ts', 'src/**/*.ts', { dot: true }, true],
    ['lib/main.js', '!src/**', {}, true],
    ['src/index.js', '!src/**', {}, false],
    ['src/app.ts', 'src\\**\\*.ts', { windowsPathsNoEscape: true }, true],
    ['C:/src/app.ts', 'c:/src/**/*.ts', { platform: 'win32', nocase: true }, true],
    ['C:/src/app.ts', 'C:/src/**/*.ts', { platform: 'win32' }, true],
    ['//host/share/src/app.ts', '//host/share/**/*.ts', { platform: 'win32' }, true],
  ];
  for (const [file, pattern, options, matches] of cases)
    assert.equal(minimatch.minimatch(file, pattern, options), matches);
  assert.equal('makeRe' in minimatch, false);
});

test('modern glob retains Promise, sync and Path contracts and stops cancelled work', async () => {
  const glob = require(modernGlobEntry);
  const directory = fixture('modern');
  const sync = sorted(glob.globSync('**/*.ts', { cwd: directory, ignore: '**/.secret/**' }));
  assert.deepEqual(
    sorted(await glob.glob('**/*.ts', { cwd: directory, ignore: '**/.secret/**' })),
    sync,
  );
  const paths = await glob.glob('**/*.ts', { cwd: directory, withFileTypes: true, dot: true });
  assert.ok(paths.length > 0);
  for (const file of paths) {
    assert.equal(typeof file.fullpath(), 'string');
    assert.equal(typeof file.relative(), 'string');
    assert.equal(typeof file.relativePosix(), 'string');
    assert.equal(file.isDirectory(), false);
  }
  for (const mode of ['promise', 'stream']) {
    const controller = new AbortController();
    const reason = new Error('probe-abort');
    let reads = 0;
    const counted = {
      ...fs,
      readdir(...args) {
        reads += 1;
        if (reads === 1) controller.abort(reason);
        return fs.readdir(...args);
      },
    };
    const options = { cwd: directory, signal: controller.signal, fs: counted };
    if (mode === 'promise') {
      await assert.rejects(glob.glob('**', options), (error) => error === reason);
    } else {
      await assert.rejects(
        async () => {
          for await (const item of glob.globStream('**', options)) void item;
        },
        (error) => error === reason,
      );
    }
    const atReject = reads;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(reads, atReject);
  }
});

test('filelist retains namespace matching and include/exclude behavior', () => {
  const { FileList } = require(filelistEntry);
  const directory = fixture('filelist');
  const files = new FileList();
  files.include(path.join(directory, 'src/**/*.ts'));
  files.exclude(path.join(directory, 'src/nested/**'));
  assert.deepEqual(
    sorted(files.toArray()),
    ['src/app.ts', 'src/café.ts', 'src/space name.ts']
      .map((file) => path.join(directory, file))
      .sort(),
  );
});

test('coverage test-exclude retains sync and Promise discovery', async () => {
  const TestExclude = require(testExcludeEntry);
  const directory = fixture('coverage');
  const exclude = new TestExclude({
    cwd: directory,
    include: ['src/**'],
    exclude: ['**/*.test.js'],
    extension: ['.js', '.ts'],
  });
  const sync = sorted(exclude.globSync(directory));
  assert.deepEqual(sorted(await exclude.glob(directory)), sync);
  assert.ok(sync.includes('src/index.js'));
  assert.equal(sync.includes('src/a.test.js'), false);
});

test('both legacy rimraf parents retain callback wildcard deletion', async () => {
  const entries = [installedEntry(mvRequire, 'rimraf'), installedEntry(tempRequire, 'rimraf')];
  for (const [index, entry] of entries.entries()) {
    const directory = path.join(temporary, 'rimraf-' + index);
    fs.mkdirSync(directory);
    for (const file of ['delete-a.txt', 'delete-b.txt', 'keep.txt'])
      fs.writeFileSync(path.join(directory, file), '');
    await new Promise((resolve, reject) =>
      require(entry)(path.join(directory, 'delete-*.txt'), (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    assert.deepEqual(fs.readdirSync(directory), ['keep.txt']);
  }
});

test('ESLint import restrictions retain allow, forbid and hostile-pattern behavior', (context) => {
  const { Linter } = require(installedEntry(rootRequire, 'eslint'));
  const rule = require(
    installedEntry(rootRequire, 'eslint-plugin-import/lib/rules/no-internal-modules'),
  );
  const linter = new Linter({ cwd: temporary });
  context.diagnostic(
    JSON.stringify({
      cwd: temporary,
      filename: path.join(temporary, 'entry.js'),
      eslint: installedEntry(rootRequire, 'eslint'),
      rule: installedEntry(rootRequire, 'eslint-plugin-import/lib/rules/no-internal-modules'),
    }),
  );
  const config = (options) => [
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { compatibility: { rules: { internal: rule } } },
      rules: { 'compatibility/internal': ['error', options] },
    },
  ];
  const cases = [
    ["import value from 'pkg/private/file';", { forbid: ['pkg/private/**'] }, 1],
    ["import value from 'pkg/public/file';", { forbid: ['pkg/private/**'] }, 0],
    ["import value from 'pkg/private/file';", { forbid: ['!pkg/public/**'] }, 1],
    ["import value from './src/index';", { allow: ['**/src/**'] }, 0],
    ["const value = require('pkg/private/file');", { forbid: ['pkg/private/**'] }, 1],
  ];
  for (const [source, options, count] of cases) {
    const messages = linter.verify(source, config(options), {
      filename: path.join(temporary, 'entry.js'),
    });
    assert.equal(
      messages.some((message) => message.fatal),
      false,
      JSON.stringify(messages),
    );
    assert.equal(
      messages.some((message) => message.ruleId !== 'compatibility/internal'),
      false,
      JSON.stringify(messages),
    );
    assert.equal(messages.length, count, JSON.stringify(messages));
  }
  assert.doesNotThrow(() =>
    linter.verify(
      "import value from 'pkg/private/file';",
      config({ forbid: [Array(8).fill('**/../a/b').join('/')] }),
    ),
  );
});

test('ASAR preserves archive creation, unpacking, listing and extraction', async () => {
  const asar = require(asarEntry);
  const directory = fixture('asar');
  const archive = path.join(temporary, 'sample.asar');
  await asar.createPackageWithOptions(directory, archive, { unpack: '**/*.ts' });
  assert.ok(asar.listPackage(archive).some((file) => file.endsWith('/src/app.ts')));
  assert.equal(asar.extractFile(archive, 'src/index.js').toString(), 'module.exports = true;\n');
  assert.ok(fs.existsSync(archive + '.unpacked/src/app.ts'));
  asar.uncache(archive);
});

test('WDIO executes its selected Mocha adapter with grep, hooks and reports', async () => {
  const { MochaAdapter } = await import(pathToFileURL(frameworkEntry).href);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(
    JSON.parse(fs.readFileSync(installedEntry(frameworkRequire, 'mocha/package.json'), 'utf8'))
      .version,
    manifest.pnpm.overrides['@wdio/mocha-framework>mocha'],
  );
  const file = path.join(temporary, 'wdio-smoke.cjs');
  fs.writeFileSync(
    file,
    "describe('adapter', function(){before(function(){globalThis.__agiAdapterHook=true;});it('selected', async function(){require('node:assert/strict').equal(globalThis.__agiAdapterHook,true);await Promise.resolve();});it('filtered', function(){throw Error('grep failed');});});\n",
  );
  const events = [];
  const hooks = [];
  const adapter = new MochaAdapter(
    '0-0',
    {
      rootDir: temporary,
      mochaOpts: { ui: 'bdd', grep: 'selected' },
      beforeSuite: [() => hooks.push('before')],
      afterSuite: [() => hooks.push('after')],
      after: [(result) => assert.equal(result, 0)],
    },
    [pathToFileURL(file).href],
    {},
    { emit: (...event) => events.push(event) },
  );
  await adapter.init();
  assert.equal(adapter.hasTests(), true);
  assert.equal(await adapter.run(), 0);
  assert.deepEqual(hooks, ['before', 'after']);
  assert.equal(events.filter(([name]) => name === 'test:pass').length, 1);
  delete globalThis.__agiAdapterHook;
});

test('Jest actually discovers, runs and instruments a Node fixture', (context) => {
  const directory = path.join(temporary, 'jest');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'sum.js'), 'module.exports = (a,b) => a+b;\n');
  fs.writeFileSync(
    path.join(directory, 'sample.test.js'),
    "const sum=require('./sum');test('sample',()=>expect(sum(2,2)).toBe(4));\n",
  );
  const jestEntry = installedEntry(mobileRequire, 'jest/bin/jest');
  function runCoverage(label, inputs) {
    const evidence = path.join(directory, 'modules-' + label + '.json');
    const observer = path.join(directory, 'modules-' + label + '.cjs');
    fs.writeFileSync(
      observer,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "process.on('exit', () => {",
        "  const names = ['babel-jest', 'babel-plugin-istanbul', 'test-exclude', 'minimatch'];",
        '  const loaded = Object.keys(require.cache);',
        "  const modules = Object.fromEntries(names.map(name => [name, loaded.filter(file => file.includes(path.sep + 'node_modules' + path.sep + name + path.sep))]));",
        '  fs.writeFileSync(' +
          JSON.stringify(evidence) +
          ', JSON.stringify({ cwd: process.cwd(), modules }));',
        '});',
      ].join('\n'),
    );
    const coverageDirectory = path.join(directory, 'coverage-' + label);
    const result = spawnSync(
      process.execPath,
      [
        '--require',
        observer,
        jestEntry,
        '--runInBand',
        '--coverage',
        '--config',
        JSON.stringify({
          rootDir: directory,
          testMatch: ['**/*.test.js'],
          testEnvironment: 'node',
          collectCoverageFrom: inputs,
          coverageDirectory,
          coverageReporters: ['json-summary'],
        }),
      ],
      { cwd: directory, encoding: 'utf8', timeout: 20000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr || result.error?.message);
    const loaded = JSON.parse(fs.readFileSync(evidence, 'utf8'));
    assert.equal(loaded.cwd, directory);
    for (const files of Object.values(loaded.modules)) assert.ok(files.length > 0);
    context.diagnostic(JSON.stringify({ label, directory, jestEntry, ...loaded }));
    return JSON.parse(
      fs.readFileSync(path.join(coverageDirectory, 'coverage-summary.json'), 'utf8'),
    );
  }
  const covered = runCoverage('covered', ['sum.js']);
  assert.ok(covered.total.lines.total > 0);
  assert.equal(covered.total.lines.pct, 100);
  assert.equal(covered[path.join(directory, 'sum.js')].functions.pct, 100);
  fs.writeFileSync(path.join(directory, 'uncovered.js'), 'module.exports = (a,b) => a-b;\n');
  const partial = runCoverage('uncovered', ['sum.js', 'uncovered.js']);
  assert.equal(partial[path.join(directory, 'sum.js')].lines.pct, 100);
  assert.ok(partial[path.join(directory, 'uncovered.js')].lines.total > 0);
  assert.equal(partial[path.join(directory, 'uncovered.js')].lines.covered, 0);
  assert.equal(partial[path.join(directory, 'uncovered.js')].functions.covered, 0);
  assert.ok(partial.total.lines.pct < 100);
});

const { Linter } = require(installedEntry(rootRequire, 'eslint'));
const importPlugin = require(installedEntry(rootRequire, 'eslint-plugin-import'));
const reactPlugin = require(installedEntry(rootRequire, 'eslint-plugin-react'));
const reactVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).pnpm
  .overrides.react;
const a11yRequire = from(webRequire, 'eslint-config-next');
const dirCompareEntry = from(appBuilderRequire, '@electron/universal').resolve('dir-compare');
const eslintRequire = from(rootRequire, 'eslint');
function publicEsmEntry(request, name) {
  let directory = path.dirname(installedEntry(request, name));
  while (directory !== path.dirname(directory)) {
    const manifestPath = path.join(directory, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const metadata = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (metadata.name === name) {
        const entry = metadata.exports['.'] ?? metadata.exports;
        const condition = entry.import;
        const target = typeof condition === 'string' ? condition : condition.default;
        assert.equal(typeof target, 'string', name + ' must declare its public ESM entry');
        return path.resolve(directory, target);
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error('Cannot locate package metadata for ' + name);
}

const configArrayEsmEntry = publicEsmEntry(eslintRequire, '@eslint/config-array');
const eslintrcEsmEntry = publicEsmEntry(eslintRequire, '@eslint/eslintrc');
fs.writeFileSync(path.join(temporary, 'module.js'), 'export default 1;\n');
fs.writeFileSync(path.join(temporary, 'asset.css'), '');

function lint(plugin, rule, source, options, filename = 'entry.jsx') {
  const ruleId = 'actual/' + rule;
  const result = new Linter({ cwd: temporary }).verify(
    source,
    [
      {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        settings: { react: { version: reactVersion } },
        plugins: { actual: plugin },
        rules: { [ruleId]: ['error', ...options] },
      },
    ],
    { filename: path.join(temporary, filename) },
  );
  assert.equal(
    result.some((message) => message.fatal),
    false,
    JSON.stringify(result),
  );
  assert.equal(
    result.some((message) => message.ruleId !== ruleId),
    false,
    JSON.stringify(result),
  );
  return result;
}
test('additional import rule paths use named matching without losing enforcement', () => {
  const cases = [
    ['no-unassigned-import', "import './asset.css';", [{ allow: ['**/*.css'] }], 0],
    ['no-unassigned-import', "import './module.js';", [{ allow: ['**/*.css'] }], 1],
    ['no-namespace', "import * as value from 'pkg/allowed';", [{ ignore: ['**/allowed'] }], 0],
    ['no-namespace', "import * as value from 'pkg/private';", [{ ignore: ['**/allowed'] }], 1],
    [
      'extensions',
      "import value from './asset.css';",
      ['never', { pathGroupOverrides: [{ pattern: '**/*.css', action: 'ignore' }] }],
      0,
    ],
    [
      'extensions',
      "import value from './module.js';",
      ['never', { pathGroupOverrides: [{ pattern: '**/*.css', action: 'ignore' }] }],
      1,
    ],
    [
      'no-import-module-exports',
      "import fs from 'node:fs'; module.exports = {};",
      [{ exceptions: ['**/allowed.jsx'] }],
      0,
      'allowed.jsx',
    ],
    [
      'no-import-module-exports',
      "import fs from 'node:fs'; module.exports = {};",
      [{ exceptions: ['**/allowed.jsx'] }],
      1,
      'blocked.jsx',
    ],
    [
      'order',
      "import item from '@app/foo';",
      [
        {
          groups: ['builtin', 'external', 'internal'],
          pathGroupsExcludedImportTypes: [],
          pathGroups: [{ pattern: '@app/**', group: 'internal' }],
        },
      ],
      0,
    ],
    [
      'order',
      "import item from '@app/foo'; import fs from 'node:fs';",
      [
        {
          groups: ['builtin', 'external', 'internal'],
          pathGroupsExcludedImportTypes: [],
          pathGroups: [{ pattern: '@app/**', group: 'internal' }],
        },
      ],
      1,
    ],
    [
      'no-extraneous-dependencies',
      "import fs from 'node:fs';",
      [{ devDependencies: ['**/allowed.jsx'], packageDir: process.cwd() }],
      0,
      'allowed.jsx',
    ],
  ];
  for (const [rule, input, options, count, filename] of cases)
    assert.equal(lint(importPlugin, rule, input, options, filename).length, count, rule);
});
test('all five React wildcard rule paths preserve positive and negative results', () => {
  const cases = require('./__fixtures__/glob-minimatch-react-cases.json');

  for (const [rule, input, options, count] of cases)
    assert.equal(lint(reactPlugin, rule, input, options).length, count, rule);
});
test('actual accessibility helpers retain wildcard control-label decisions', () => {
  const contains = require(
    installedEntry(a11yRequire, 'eslint-plugin-jsx-a11y/lib/util/mayContainChildComponent.js'),
  );
  const label = require(
    installedEntry(a11yRequire, 'eslint-plugin-jsx-a11y/lib/util/mayHaveAccessibleLabel.js'),
  );
  const element = { type: 'JSXElement', openingElement: { attributes: [] }, children: [] };
  assert.equal(
    contains({ children: [element] }, 'Form*', 1, () => 'FormControl'),
    true,
  );
  assert.equal(
    contains({ children: [element] }, 'Other*', 1, () => 'FormControl'),
    false,
  );
  assert.equal(
    label(element, 1, [], () => 'FormControl', ['Form*']),
    false,
  );
  assert.equal(
    label(element, 1, [], () => 'FormControl', ['Other*']),
    true,
  );
});
test('public directory comparison preserves include and exclude filters', () => {
  const a = path.join(temporary, 'a'),
    b = path.join(temporary, 'b');
  fs.mkdirSync(a);
  fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, 'same.js'), 'same');
  fs.writeFileSync(path.join(b, 'same.js'), 'same');
  fs.writeFileSync(path.join(a, 'different.ts'), 'first');
  fs.writeFileSync(path.join(b, 'different.ts'), 'second');
  const compare = require(dirCompareEntry);
  assert.equal(
    compare.compareSync(a, b, { compareContent: true, includeFilter: '*.js' }).same,
    true,
  );
  assert.equal(
    compare.compareSync(a, b, { compareContent: true, includeFilter: '*.ts' }).same,
    false,
  );
  assert.equal(
    compare.compareSync(a, b, { compareContent: true, excludeFilter: '*.ts' }).same,
    true,
  );
});
test('native ESM ConfigArray imports and matches its public file patterns', async () => {
  const { ConfigArray } = await import(pathToFileURL(configArrayEsmEntry).href);
  const configurations = new ConfigArray([{ files: ['**/*.js'], marker: true }], {
    basePath: temporary,
    schema: { marker: { merge: 'replace', validate: 'boolean' } },
  });
  configurations.normalizeSync();
  assert.equal(configurations.getConfig(path.join(temporary, 'main.js')).marker, true);
  assert.equal(configurations.getConfig(path.join(temporary, 'main.ts')), undefined);
});
test('native ESM legacy config translation preserves override exclusions', async () => {
  const { FlatCompat } = await import(pathToFileURL(eslintrcEsmEntry).href);
  const compatibility = new FlatCompat({ baseDirectory: temporary });
  const configurations = compatibility.config({
    overrides: [
      {
        files: ['**/*.js'],
        excludedFiles: ['**/*.test.js'],
        rules: { eqeqeq: 'error' },
      },
    ],
  });
  const configuration = configurations.find((item) => item.rules?.eqeqeq);
  assert(configuration);
  assert.equal(configuration.files[0](path.join(temporary, 'main.js')), true);
  assert.equal(configuration.files[0](path.join(temporary, 'main.test.js')), false);
  assert.equal(configuration.files[0](path.join(temporary, 'main.ts')), false);
});
