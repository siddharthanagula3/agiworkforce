import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  addCargoPackage,
  buildNotices,
  cargoRuntimeClosure,
  collectNpmProductionGraph,
  npmLicenseOf,
  packageRootOfModule,
  projectUrl,
  readNoticeFiles,
  renderNoticesText,
  splitCopyright,
  textId,
} from './third-party-notices.mjs';

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function sandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'third-party-notices-'));
  sandboxes.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const MIT_BODY = [
  'MIT License',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy.',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
].join('\n');

function record(overrides) {
  return {
    ecosystem: 'npm',
    name: 'pkg',
    version: '1.0.0',
    license: 'MIT',
    url: null,
    files: [],
    sources: new Set(['web']),
    ...overrides,
  };
}

test('keeps the license wording and lifts only dated copyright lines', () => {
  const split = splitCopyright(`Copyright (c) 2024 Jane Doe\n\n${MIT_BODY}`);
  assert.deepEqual(split.copyright, ['Copyright (c) 2024 Jane Doe']);
  assert.equal(split.body, MIT_BODY);
  assert.match(split.body, /The above copyright notice/);
});

test('leaves a lettered license clause in the text and lifts only dated (c) lines', () => {
  const clause = '(c) You must retain, in the Source form of any Derivative Works, all notices.';
  const split = splitCopyright(`(C) 2021 Jane Doe\n${clause}\nCopyright (C) John Roe`);
  assert.deepEqual(split.copyright, ['(C) 2021 Jane Doe', 'Copyright (C) John Roe']);
  assert.equal(split.body, clause);
});

test('reads every license, copying and notice file a package ships, in a stable order', () => {
  const dir = sandbox({
    'LICENSE-MIT': 'mit text',
    'LICENSE-APACHE': 'apache text',
    NOTICE: 'notice text',
    'README.md': 'not a notice',
  });
  assert.deepEqual(readNoticeFiles(dir), ['apache text', 'mit text', 'notice text']);
  assert.deepEqual(readNoticeFiles(sandbox({ 'index.js': '' })), []);
});

test('reads a crate license_file outside the usual names', () => {
  const dir = sandbox({ 'COPYRIGHT.txt': 'crate terms' });
  assert.deepEqual(readNoticeFiles(dir, 'COPYRIGHT.txt'), ['crate terms']);
});

test('reads the declared license in each npm manifest shape', () => {
  assert.equal(npmLicenseOf({ license: 'MIT' }), 'MIT');
  assert.equal(npmLicenseOf({ license: { type: 'ISC' } }), 'ISC');
  assert.equal(npmLicenseOf({ licenses: [{ type: 'MIT' }, 'Apache-2.0'] }), 'MIT OR Apache-2.0');
  assert.equal(npmLicenseOf({}), 'UNKNOWN');
});

test('turns repository references into project links', () => {
  assert.equal(
    projectUrl(undefined, { url: 'git+https://github.com/a/b.git' }),
    'https://github.com/a/b',
  );
  assert.equal(projectUrl(undefined, 'github:a/b'), 'https://github.com/a/b');
  assert.equal(projectUrl(undefined, 'a/b'), 'https://github.com/a/b');
  assert.equal(projectUrl(undefined, 'git@github.com:a/b.git'), 'https://github.com/a/b');
  assert.equal(projectUrl('https://example.org', undefined), 'https://example.org');
  assert.equal(projectUrl(undefined, undefined), null);
  assert.equal(
    projectUrl('https://github.com/o/mono/tree/main/lib/core#readme', undefined),
    'https://github.com/o/mono',
  );
  assert.equal(projectUrl('https://example.org/lib#readme', undefined), 'https://example.org/lib');
});

test('walks production dependencies only and leaves out first-party packages', () => {
  const root = sandbox({
    'app/package.json': JSON.stringify({
      dependencies: { left: '1', '@agiworkforce/types': '1' },
      devDependencies: { dev: '1' },
    }),
    'app/node_modules/left/package.json': JSON.stringify({
      name: 'left',
      version: '1.0.0',
      license: 'MIT',
      dependencies: { leaf: '1' },
    }),
    'app/node_modules/left/LICENSE': `Copyright 2020 Left\n${MIT_BODY}`,
    'app/node_modules/leaf/package.json': JSON.stringify({
      name: 'leaf',
      version: '2.0.0',
      license: 'ISC',
    }),
    'app/node_modules/dev/package.json': JSON.stringify({ name: 'dev', version: '1.0.0' }),
    'app/node_modules/@agiworkforce/types/package.json': JSON.stringify({
      name: '@agiworkforce/types',
      version: '0.0.0',
    }),
  });
  const records = new Map();
  const unresolved = collectNpmProductionGraph(records, path.join(root, 'app'), 'web');
  assert.deepEqual([...records.keys()].sort(), ['npm:leaf@2.0.0', 'npm:left@1.0.0']);
  assert.equal(unresolved.size, 0);
  assert.deepEqual(records.get('npm:left@1.0.0').files, [`Copyright 2020 Left\n${MIT_BODY}`]);
});

test('stores each license text once, whatever its wrapping, and keeps per-package copyright', () => {
  const rewrapped = MIT_BODY.replace('obtaining a copy.', 'obtaining\n   a copy.  ');
  const records = new Map([
    [
      'b',
      record({
        name: 'b',
        files: [`Copyright 2020 B\n${MIT_BODY}`],
        sources: new Set(['web', 'desktop']),
      }),
    ],
    [
      'a',
      record({
        name: 'a',
        version: '2.0.0',
        files: [`Copyright 2021 A\n${rewrapped}`, 'NOTICE text'],
      }),
    ],
    [
      'c',
      record({ ecosystem: 'cargo', name: 'c', license: 'Apache-2.0', sources: new Set(['cli']) }),
    ],
  ]);
  const notices = buildNotices(records);
  assert.equal(Object.keys(notices.texts).length, 2);
  assert.deepEqual(
    notices.packages.map((pkg) => [pkg.name, pkg.copyright, pkg.sources, pkg.textIds.length]),
    [
      ['a', ['Copyright 2021 A'], ['web'], 2],
      ['b', ['Copyright 2020 B'], ['desktop', 'web'], 1],
      ['c', [], ['cli'], 0],
    ],
  );
  assert.equal(notices.packages[0].textIds[0], notices.packages[1].textIds[0]);
  const stored = splitCopyright(rewrapped).body;
  assert.equal(notices.texts[textId(MIT_BODY)], MIT_BODY < stored ? MIT_BODY : stored);
});

test('maps a bundled module path to its package root, scoped or not', () => {
  assert.equal(
    packageRootOfModule('node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode/lib/index.js'),
    'node_modules/.pnpm/qrcode@1.5.4/node_modules/qrcode',
  );
  assert.equal(
    packageRootOfModule('node_modules/.pnpm/x/node_modules/@scope/pkg/dist/a.js'),
    'node_modules/.pnpm/x/node_modules/@scope/pkg',
  );
  assert.equal(packageRootOfModule('packages/contracts/types/src/index.ts'), null);
});

test('follows only runtime cargo edges and leaves out workspace crates', () => {
  const metadata = {
    packages: [
      { id: 'cli', name: 'agiworkforce-cli', source: null },
      { id: 'proto', name: 'agiworkforce-protocol', source: null },
      { id: 'serde', name: 'serde', source: 'registry' },
      { id: 'itoa', name: 'itoa', source: 'registry' },
      { id: 'cc', name: 'cc', source: 'registry' },
      { id: 'tempfile', name: 'tempfile', source: 'registry' },
    ],
    resolve: {
      nodes: [
        {
          id: 'cli',
          deps: [
            { pkg: 'proto', dep_kinds: [{ kind: null }] },
            { pkg: 'cc', dep_kinds: [{ kind: 'build' }] },
            { pkg: 'tempfile', dep_kinds: [{ kind: 'dev' }] },
          ],
        },
        { id: 'proto', deps: [{ pkg: 'serde', dep_kinds: [{ kind: null }] }] },
        { id: 'serde', deps: [{ pkg: 'itoa', dep_kinds: [{ kind: null }, { kind: 'dev' }] }] },
      ],
    },
  };
  assert.deepEqual(
    cargoRuntimeClosure(metadata, 'agiworkforce-cli')
      .map((pkg) => pkg.name)
      .sort(),
    ['itoa', 'serde'],
  );
  assert.throws(() => cargoRuntimeClosure(metadata, 'missing'), /no workspace package missing/);
});

test('reads a crate license and notice files from its manifest folder', () => {
  const dir = sandbox({
    'crate/LICENSE-MIT': `Copyright (c) 2024 Jane Doe\n\n${MIT_BODY}`,
    'crate/Cargo.toml': '',
  });
  const records = new Map();
  addCargoPackage(
    records,
    {
      name: 'crate',
      version: '2.1.0',
      license: 'MIT',
      repository: 'https://github.com/jane/crate.git',
      manifest_path: path.join(dir, 'crate/Cargo.toml'),
    },
    'cli',
  );
  const [pkg] = buildNotices(records).packages;
  assert.equal(pkg.ecosystem, 'cargo');
  assert.equal(pkg.url, 'https://github.com/jane/crate');
  assert.deepEqual(pkg.copyright, ['Copyright (c) 2024 Jane Doe']);
  assert.deepEqual(pkg.sources, ['cli']);
});

test('renders every package with its copyright and numbered license text', () => {
  const dirA = sandbox({ LICENSE: `Copyright (c) 2024 Jane Doe\n\n${MIT_BODY}` });
  const dirB = sandbox({ LICENSE: `Copyright (c) 2023 John Roe\n\n${MIT_BODY}` });
  const dirC = sandbox({ LICENSE: 'Apache License\nVersion 2.0, January 2004' });
  const records = new Map();
  for (const [name, dir, license] of [
    ['alpha', dirA, 'MIT'],
    ['beta', dirB, 'MIT'],
    ['gamma', dirC, 'Apache-2.0'],
  ]) {
    records.set(`npm:${name}@1.0.0`, record({ name, license, files: readNoticeFiles(dir) }));
  }
  const text = renderNoticesText(buildNotices(records), { title: 'Notices', intro: 'Intro line.' });

  assert.match(text, /^Notices\n=======\n\nIntro line\./);
  assert.match(text, /Packages \(3\)/);
  assert.match(
    text,
    /alpha 1\.0\.0 \(MIT\)\n {2}Copyright \(c\) 2024 Jane Doe\n {2}License text: 1/,
  );
  assert.match(
    text,
    /beta 1\.0\.0 \(MIT\)\n {2}Copyright \(c\) 2023 John Roe\n {2}License text: 1/,
  );
  assert.match(text, /gamma 1\.0\.0 \(Apache-2\.0\)\n {2}License text: 2/);
  assert.equal(text.match(/Permission is hereby granted/g)?.length, 1);
  assert.match(text, /\[1\] MIT License/);
  assert.match(text, /\[2\] Apache License/);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
});
