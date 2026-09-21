import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MIGRATIONS_DIR,
  REGISTRY_PATH,
  SCOPES_MODULE,
  checkSettingsPrecedence,
  findClientPrecedence,
  readTableNames,
} from './check-settings-precedence.mjs';

const SCOPES = ['account', 'organization', 'workspace', 'project', 'device', 'turn'];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function module_({ scopes = SCOPES, mandatory = ['organization', 'workspace'], outcomes } = {}) {
  const list = (name, members) =>
    `export const ${name} = [${members.map((member) => `'${member}'`).join(', ')}] as const;\n`;
  return (
    list('SETTINGS_SCOPES', scopes) +
    list('MANDATORY_CAPABLE_SCOPES', mandatory) +
    list(
      'SETTING_RESOLUTION_OUTCOMES',
      outcomes ?? ['resolved', 'unreadable_value', 'rule_newer_than_reader'],
    )
  );
}

function fixture({ moduleSource, registry, migrations } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'settings-precedence-'));
  write(root, SCOPES_MODULE, moduleSource ?? module_());
  write(
    root,
    REGISTRY_PATH,
    JSON.stringify(
      registry ?? {
        tables: { user_settings: { scope: 'account', why: 'one row per account' } },
        unscopedTables: [],
      },
    ),
  );
  write(
    root,
    `${MIGRATIONS_DIR}/0001_settings.sql`,
    migrations ?? 'create table if not exists public.user_settings (user_id text);\n',
  );
  spawnSync('git', ['-C', root, 'init', '-q'], { encoding: 'utf8' });
  return root;
}

function run(root) {
  return checkSettingsPrecedence(root).errors.join('\n');
}

const roots = [];
const sandbox = (options) => {
  const root = fixture(options);
  roots.push(root);
  return root;
};

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a total order over placed tables passes', () => {
  assert.equal(run(sandbox()), '');
});

test('a repeated scope stops resolution being deterministic', () => {
  const root = sandbox({
    moduleSource: module_({ scopes: [...SCOPES, 'account'] }),
  });
  assert.match(run(root), /repeats a scope/);
});

test('a mandate at the narrowest scope fails', () => {
  const root = sandbox({ moduleSource: module_({ mandatory: ['organization', 'turn'] }) });
  assert.match(run(root), /the reader overruling themselves/);
});

test('a mandatory scope that is not a scope fails', () => {
  const root = sandbox({ moduleSource: module_({ mandatory: ['tenant'] }) });
  assert.match(run(root), /names "tenant", which is not a settings scope/);
});

test('losing the unreadable-value outcome fails', () => {
  const root = sandbox({
    moduleSource: module_({ outcomes: ['resolved', 'rule_newer_than_reader'] }),
  });
  assert.match(run(root), /no "unreadable_value" outcome/);
});

test('a settings table that names no scope fails', () => {
  const root = sandbox({
    migrations:
      'create table if not exists public.user_settings (user_id text);\n' +
      'create table if not exists public.workspace_preferences (workspace_id text);\n',
  });
  assert.match(run(root), /workspace_preferences stores a setting and names no scope/);
});

test('a recorded unscoped table without a reason fails, and one that is placed has to go', () => {
  const root = sandbox({
    registry: {
      tables: { user_settings: { scope: 'account', why: 'one row per account' } },
      unscopedTables: [{ table: 'workspace_preferences' }],
    },
    migrations: 'create table if not exists public.user_settings (user_id text);\n',
  });
  const report = run(root);
  assert.match(report, /carries no reason/);
  assert.match(report, /no longer describes a real gap/);
});

test('a scope no vocabulary declares fails', () => {
  const root = sandbox({
    registry: {
      tables: { user_settings: { scope: 'tenant', why: 'one row per account' } },
      unscopedTables: [],
    },
  });
  assert.match(run(root), /claims scope "tenant", which does not exist/);
});

test('a declared table no migration creates fails', () => {
  const root = sandbox({
    registry: {
      tables: {
        user_settings: { scope: 'account', why: 'one row per account' },
        ghost_settings: { scope: 'account', why: 'gone' },
      },
      unscopedTables: [],
    },
  });
  assert.match(run(root), /declares ghost_settings, which no migration creates/);
});

test('a client that orders the scopes for itself is found', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'settings-client-'));
  roots.push(root);
  write(
    root,
    'apps/web/features/settings/precedence.ts',
    `const ORDER = ['turn', 'conversation', 'project', 'workspace', 'account'];\n` +
      `export const effectiveValue = (rules) => rules.sort((a, b) => ORDER.indexOf(a.scope) - ORDER.indexOf(b.scope))[0];\n`,
  );
  const violations = findClientPrecedence({
    repoRoot: root,
    files: ['apps/web/features/settings/precedence.ts'],
    scopes: ['turn', 'conversation', 'project', 'workspace', 'account'],
  });
  assert.equal(violations.length, 1);
});

test('a client that reads the contract is not a violation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'settings-client-ok-'));
  roots.push(root);
  write(
    root,
    'apps/web/features/settings/panel.ts',
    `import { resolveSetting } from '@agiworkforce/types';\n` +
      `const LABELS = { turn: 'a', conversation: 'b', project: 'c', workspace: 'd', account: 'e' };\n` +
      `export const effectiveValue = resolveSetting;\n`,
  );
  assert.deepEqual(
    findClientPrecedence({
      repoRoot: root,
      files: ['apps/web/features/settings/panel.ts'],
      scopes: ['turn', 'conversation', 'project', 'workspace', 'account'],
    }),
    [],
  );
});

test('the table reader reads the migration history, not a list', () => {
  const root = sandbox({
    migrations:
      'create table if not exists public.user_settings (user_id text);\n' +
      'create table public.other (id text);\n',
  });
  const tables = readTableNames(root);
  assert.ok(tables.has('user_settings'));
  assert.ok(tables.has('other'));
});
