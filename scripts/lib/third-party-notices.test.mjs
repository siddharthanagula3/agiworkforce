import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  buildNotices,
  collectNpmProductionGraph,
  npmLicenseOf,
  projectUrl,
  readNoticeFiles,
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
