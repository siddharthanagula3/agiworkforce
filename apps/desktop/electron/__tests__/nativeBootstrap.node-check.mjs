import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';

const { Request } = globalThis;

const require = createRequire(import.meta.url);
const { bootstrapOwnedNative } = require('./fixtures/native-bootstrap.cjs');

function setup(t, browserOnly = false) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-bootstrap-check-'));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  const environment = {
    AGI_OWNED_PROFILE: profile,
    AGI_OWNED_PROJECT: path.join(profile, 'project'),
    AGI_OWNED_ORIGIN: 'http://127.0.0.1:5432',
    AGI_OWNED_MAIN: path.join(profile, 'a";globalThis.injected=true;//main.cjs'),
    AGI_OWNED_BROWSER_ONLY: browserOnly ? '1' : '0',
  };
  const loaded = [],
    fetched = [],
    paths = [];
  const electron = {
    app: { setPath: (...args) => paths.push(args) },
    dialog: {},
    globalShortcut: {},
    shell: {},
  };
  const target = {
    fetch: async (...args) => {
      fetched.push(args);
      return 'fixture reply';
    },
  };
  bootstrapOwnedNative(electron, environment, target, (file) => loaded.push(file));
  return { environment, loaded, fetched, paths, electron, target };
}

test('repository paths remain data and the original fetch runs once', async (t) => {
  const state = setup(t);
  assert.deepEqual(state.loaded, [state.environment.AGI_OWNED_MAIN]);
  assert.equal(state.target.injected, undefined);
  assert.equal(
    await state.target.fetch(`${state.environment.AGI_OWNED_ORIGIN}/v1/models`),
    'fixture reply',
  );
  assert.equal(state.fetched.length, 1);
  assert.deepEqual(state.paths[0], ['userData', state.environment.AGI_OWNED_PROFILE]);
});

test('lookalike origins and embedded credentials cannot leave the fixture', async (t) => {
  const state = setup(t);
  for (const url of [
    'http://127.0.0.1:54321/',
    'http://127.0.0.1:5433/',
    'http://user:password@127.0.0.1:5432/',
  ]) {
    await assert.rejects(state.target.fetch(url), /outside this owned fixture/);
  }
  assert.equal(state.fetched.length, 0);
});

test('URL and Request inputs keep the same exact-origin restriction', async (t) => {
  const state = setup(t);
  await state.target.fetch(new URL(`${state.environment.AGI_OWNED_ORIGIN}/one`));
  await state.target.fetch(new Request(`${state.environment.AGI_OWNED_ORIGIN}/two`));
  await assert.rejects(
    state.target.fetch(new Request('https://outside.example/')),
    /outside this owned fixture/,
  );
  assert.equal(state.fetched.length, 2);
});

test('browser-only fixtures record the literal address without executing it', async (t) => {
  const state = setup(t, true);
  const url = 'https://example.test/?message=";globalThis.injected=true;';
  await state.electron.shell.openExternal(url);
  const record = JSON.parse(
    fs.readFileSync(path.join(state.environment.AGI_OWNED_PROFILE, 'opened.jsonl'), 'utf8'),
  );
  assert.deepEqual(record, { url });
  assert.equal(state.target.injected, undefined);
});
