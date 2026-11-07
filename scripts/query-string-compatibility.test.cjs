'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { after, test } = require('node:test');

const root = process.cwd();
const mobileRequire = createRequire(path.join(root, 'apps/mobile/package.json'));
const routerRequire = createRequire(mobileRequire.resolve('expo-router/package.json'));
const queryPath = routerRequire.resolve('query-string');
const queryString = routerRequire('query-string');
const queryRequire = createRequire(queryPath);
const decoderPath = queryRequire.resolve('decode-uri-component');

test('Expo query parsing decodes Unicode and exactly one encoding layer', () => {
  const parsed = queryString.parse('name=st%C3%A5le&emoji=%F0%9F%92%A1&escaped=%2525&plus=a+b');
  assert.equal(parsed.name, 'ståle');
  assert.equal(parsed.emoji, '💡');
  assert.equal(parsed.escaped, '%25');
  assert.equal(parsed.plus, 'a b');
  assert.deepEqual(queryString.parse('tag=one&tag=two').tag, ['one', 'two']);
});

test('the installed CommonJS patch is necessary with the locked ESM decoder', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-query-string-upstream-'));
  after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.cpSync(path.dirname(queryPath), directory, { recursive: true });
  fs.symlinkSync(
    path.dirname(path.dirname(queryPath)),
    path.join(directory, 'node_modules'),
    'junction',
  );
  const environment = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX'])
    delete environment[name];
  const reverse = spawnSync(
    'git',
    ['apply', '--reverse', path.join(root, 'patches/query-string@7.1.3.patch')],
    {
      cwd: directory,
      env: environment,
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  assert.equal(reverse.status, 0, reverse.stderr);
  const upstream = require(path.join(directory, 'index.js'));
  assert.throws(() => upstream.parse('name=st%C3%A5le'), /decodeComponent is not a function/);
});

test('the patched decoder bounds work on many distinct malformed encoded runs', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const decode = require(${JSON.stringify(decoderPath)}).default;
    let input = '%41x';
    for (let index = 0; index < 32000; index++) {
      input += '%' + Math.floor(index / 256).toString(16).padStart(2, '0') +
        '%' + (index % 256).toString(16).padStart(2, '0') + 'x';
    }
    input += '%zz';
    const decoded = decode(input);
    assert.ok(decoded.startsWith('Ax'));
    assert.ok(decoded.endsWith('%zz'));
    process.stdout.write(JSON.stringify({ inputBytes: input.length, outputCharacters: decoded.length }));
  `,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const measured = JSON.parse(result.stdout);
  assert.equal(measured.inputBytes, 224007);
  assert.ok(measured.outputCharacters > 0);
});
