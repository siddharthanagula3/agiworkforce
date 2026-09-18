import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import {
  compareRollback,
  compareUpgrade,
  platformDataDir,
  readSchemaVersion,
  runtimeVersionFailures,
  snapshot,
} from './verify-desktop-upgrade.mjs';

function seedDataDir(schemaVersion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-desktop-data-'));
  fs.mkdirSync(path.join(root, 'models'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ theme: 'dark' }));
  fs.writeFileSync(path.join(root, 'models', 'model.bin'), 'cached-weights');
  const database = new DatabaseSync(path.join(root, 'agi.db'));
  database.exec('create table schema_version (version integer)');
  database.exec(`insert into schema_version (version) values (${schemaVersion})`);
  database.exec('create table conversations (id integer primary key, title text)');
  database.exec("insert into conversations (id, title) values (1, 'kept across upgrade')");
  database.close();
  return root;
}

function migrate(root, toVersion) {
  const database = new DatabaseSync(path.join(root, 'agi.db'));
  database.exec(`insert into schema_version (version) values (${toVersion})`);
  database.close();
}

test('readSchemaVersion reports the highest applied migration', () => {
  const root = seedDataDir(70);
  try {
    assert.deepEqual(readSchemaVersion(path.join(root, 'agi.db')), { readable: true, version: 70 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readSchemaVersion refuses to guess at an encrypted database', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-desktop-enc-'));
  try {
    fs.writeFileSync(path.join(root, 'agi.db'), Buffer.from('not-a-plain-sqlite-header-0000'));
    assert.deepEqual(readSchemaVersion(path.join(root, 'agi.db')), {
      readable: false,
      reason: 'encrypted-or-not-sqlite',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a real upgrade that migrates the schema and keeps user data passes', () => {
  const root = seedDataDir(70);
  try {
    const before = snapshot(root, { database: 'agi.db' });
    migrate(root, 78);
    const after = snapshot(root, { database: 'agi.db' });
    assert.deepEqual(
      compareUpgrade(before, after, { preserve: ['config.json', 'models/model.bin'] }),
      [],
    );
    assert.equal(before.schema.version, 70);
    assert.equal(after.schema.version, 78);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an upgrade that deletes the model cache or rewrites config is rejected', () => {
  const root = seedDataDir(70);
  try {
    const before = snapshot(root, { database: 'agi.db' });
    fs.rmSync(path.join(root, 'models', 'model.bin'));
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ theme: 'reset' }));
    const after = snapshot(root, { database: 'agi.db' });
    const failures = compareUpgrade(before, after, {
      preserve: ['config.json', 'models/model.bin'],
    });
    assert.ok(failures.some((message) => message.includes('models/model.bin')));
    assert.ok(failures.some((message) => message.includes('config.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an upgrade that never created a database is rejected instead of silently passing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-desktop-empty-'));
  try {
    fs.writeFileSync(path.join(root, 'config.json'), '{}');
    const before = snapshot(root, { database: 'agi.db' });
    const after = snapshot(root, { database: 'agi.db' });
    assert.deepEqual(compareUpgrade(before, after), [
      'the previous version never created its database, so no migration was exercised',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rollback must leave the preserved files and a readable database behind', () => {
  const root = seedDataDir(70);
  try {
    migrate(root, 78);
    const afterUpgrade = snapshot(root, { database: 'agi.db' });
    fs.rmSync(path.join(root, 'models', 'model.bin'));
    const afterRollback = snapshot(root, { database: 'agi.db' });
    assert.deepEqual(
      compareRollback(afterUpgrade, afterRollback, { preserve: ['models/model.bin'] }),
      ['rollback lost a preserved file: models/model.bin'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const UPGRADE_SOURCE = fs.readFileSync(
  new URL('../apps/desktop/src-tauri/src/upgrade/mod.rs', import.meta.url),
  'utf8',
);
const CARGO_TOML = fs.readFileSync(
  new URL('../apps/desktop/src-tauri/Cargo.toml', import.meta.url),
  'utf8',
);

test('the committed local runtime version matches the dependency it was reviewed against', () => {
  assert.deepEqual(
    runtimeVersionFailures({ upgradeSource: UPGRADE_SOURCE, cargoToml: CARGO_TOML }),
    [],
  );
});

test('moving llama.cpp without moving the runtime version fails', () => {
  const bumped = CARGO_TOML.replace(
    /llama-cpp-2 = \{ version = "[^"]+"/,
    'llama-cpp-2 = { version = "0.2"',
  );
  assert.notEqual(bumped, CARGO_TOML);
  const failures = runtimeVersionFailures({ upgradeSource: UPGRADE_SOURCE, cargoToml: bumped });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /LOCAL_RUNTIME_DEPENDENCY still records/u);
});

test('a runtime floor above the shipped runtime fails', () => {
  const broken = UPGRADE_SOURCE.replace(
    'pub const MIN_COMPATIBLE_RUNTIME_VERSION: u32 = 1;',
    'pub const MIN_COMPATIBLE_RUNTIME_VERSION: u32 = 9;',
  );
  const failures = runtimeVersionFailures({ upgradeSource: broken, cargoToml: CARGO_TOML });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /refuses its own runtime/u);
});

test('a missing runtime constant is an error rather than a silent zero', () => {
  const stripped = UPGRADE_SOURCE.replace(/pub const LOCAL_RUNTIME_VERSION: u32 = \d+;/, '');
  assert.throws(
    () => runtimeVersionFailures({ upgradeSource: stripped, cargoToml: CARGO_TOML }),
    /LOCAL_RUNTIME_VERSION is no longer declared/u,
  );
});

test('each platform names the directory an upgrade has to preserve', () => {
  const identifier = 'com.example.app';
  const home = '/home/qa';
  assert.equal(
    platformDataDir('linux', identifier, {}, home),
    '/home/qa/.local/share/com.example.app',
  );
  assert.equal(
    platformDataDir('linux', identifier, { XDG_DATA_HOME: '/data' }, home),
    '/data/com.example.app',
  );
  assert.equal(
    platformDataDir('macos', identifier, {}, home),
    '/home/qa/Library/Application Support/com.example.app',
  );
  assert.equal(
    platformDataDir('windows', identifier, { APPDATA: '/users/qa/AppData/Roaming' }, home),
    '/users/qa/AppData/Roaming/com.example.app',
  );
  assert.throws(() => platformDataDir('freebsd', identifier, {}, home), /unknown platform/u);
  assert.throws(() => platformDataDir('macos', '', {}, home), /bundle identifier/u);
});

test('a crashed run that left the data intact still passes the upgrade comparison', () => {
  const root = seedDataDir(70);
  try {
    fs.writeFileSync(path.join(root, 'agi.db-journal'), 'partial write from a crash');
    const before = snapshot(root, { database: 'agi.db' });
    assert.deepEqual(before.schema, { readable: false, reason: 'locked-or-hot-journal' });
    assert.ok(!before.files.some((entry) => entry.path.endsWith('-journal')));

    migrate(root, 71);
    const after = snapshot(root, { database: 'agi.db' });
    assert.deepEqual(compareUpgrade(before, after, { preserve: ['models/model.bin'] }), []);
    assert.equal(after.schema.version, 71);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rebuilding the synced half from the cloud may not take the local-only half with it', () => {
  const root = seedDataDir(70);
  try {
    const before = snapshot(root, { database: 'agi.db' });
    fs.rmSync(path.join(root, 'agi.db'));
    const database = new DatabaseSync(path.join(root, 'agi.db'));
    database.exec('create table schema_version (version integer)');
    database.exec('insert into schema_version (version) values (70)');
    database.close();
    const after = snapshot(root, { database: 'agi.db' });
    assert.deepEqual(compareUpgrade(before, after, { preserve: ['models/model.bin'] }), []);

    const wiped = seedDataDir(70);
    fs.rmSync(path.join(wiped, 'models', 'model.bin'));
    const failures = compareUpgrade(before, snapshot(wiped, { database: 'agi.db' }), {
      preserve: ['models/model.bin'],
    });
    fs.rmSync(wiped, { recursive: true, force: true });
    assert.ok(failures.some((failure) => failure.includes('models/model.bin')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
