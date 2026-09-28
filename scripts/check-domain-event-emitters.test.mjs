import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CATALOG_PATH,
  EMITTERS,
  RECORDED_GAPS,
  REPO_ROOT,
  checkDomainEventEmitters,
  emittedNames,
  readCatalog,
} from './check-domain-event-emitters.mjs';

const roots = [];

function fixture({ edits = {}, added = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-domain-event-emitters-'));
  roots.push(root);
  for (const relative of [CATALOG_PATH, ...EMITTERS]) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  for (const [relative, edit] of Object.entries(edits)) {
    const absolute = path.join(root, relative);
    writeFileSync(absolute, edit(readFileSync(absolute, 'utf8')));
  }
  for (const [relative, source] of Object.entries(added)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands emits catalogued names only and records every other event', () => {
  assert.deepEqual(checkDomainEventEmitters(REPO_ROOT), []);
  assert.deepEqual(checkDomainEventEmitters(fixture()), []);
});

test('it reads the catalog rather than a list of its own', () => {
  const catalog = readCatalog(readFileSync(path.join(REPO_ROOT, CATALOG_PATH), 'utf8'));
  assert.ok(catalog.verbs.includes('deleted'), catalog.verbs.join(','));
  assert.ok(catalog.names.includes('identity.data.exported'), catalog.names.join(','));
  const emitted = emittedNames(readFileSync(path.join(REPO_ROOT, EMITTERS[0]), 'utf8'));
  assert.ok(emitted.length > 0);
  for (const name of Object.keys(RECORDED_GAPS)) assert.ok(!emitted.includes(name), name);
});

test('an emitter that uses a name the catalog does not declare fails', () => {
  const root = fixture({
    edits: {
      [EMITTERS[0]]: (source) =>
        source.replace("'identity.session.started'", "'identity.session.opened'"),
    },
  });
  const failures = checkDomainEventEmitters(root);
  assert.ok(failures.some((entry) => /emits 'identity\.session\.opened'/.test(entry)));
  assert.ok(
    failures.some((entry) =>
      /'identity\.session\.started' is catalogued, nothing emits it/.test(entry),
    ),
  );
});

test('a module that mints envelopes without being named fails', () => {
  const root = fixture({
    added: {
      'apps/web/lib/rogue-events.ts':
        "import { createDomainEventEnvelope } from '@agiworkforce/cloud-contracts';\nexport const make = (input: never) => createDomainEventEnvelope(input);\n",
    },
  });
  assert.ok(
    checkDomainEventEmitters(root).some((entry) =>
      /rogue-events\.ts mints domain event envelopes without being a named emitter/.test(entry),
    ),
  );
});

test('a recorded gap that gains an emitter fails until it is deleted', () => {
  const gaps = { ...RECORDED_GAPS };
  const root = fixture({
    edits: {
      [EMITTERS[0]]: (source) =>
        source.replace(
          "login: { name: 'identity.session.started'",
          "login: { name: 'project.project.deleted', outcomes: SUCCEEDED },\n    logout_alias: { name: 'identity.session.started'",
        ),
    },
  });
  assert.ok(
    checkDomainEventEmitters(root, { gaps }).some((entry) =>
      /'project\.project\.deleted' is emitted by .* and still recorded as a gap/.test(entry),
    ),
  );
});

test('a catalogued event that is neither emitted nor recorded fails', () => {
  const gaps = { ...RECORDED_GAPS };
  delete gaps['chat.message.created'];
  assert.ok(
    checkDomainEventEmitters(fixture(), { gaps }).some((entry) =>
      /'chat\.message\.created' is catalogued, nothing emits it, and it is not a recorded gap/.test(
        entry,
      ),
    ),
  );
});
