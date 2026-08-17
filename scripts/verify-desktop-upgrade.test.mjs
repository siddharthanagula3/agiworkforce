import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import {
  compareRollback,
  compareUpgrade,
  readSchemaVersion,
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
