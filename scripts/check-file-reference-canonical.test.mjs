import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT,
  MODEL,
  REQUIRED_ROLES,
  TEXT_LIMIT_BASELINE,
  declaredRoles,
  evaluate,
  mintedIdentities,
} from './check-file-reference-canonical.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

function scratchRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-reference-guard-'));
  for (const relativePath of [CONTRACT, MODEL, ...Object.keys(TEXT_LIMIT_BASELINE)]) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, relativePath), destination);
  }
  return root;
}

function write(root, relativePath, source) {
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, source);
}

test('a faithful copy of the contract passes', () => {
  const root = scratchRepository();
  assert.deepEqual(evaluate(root).failures, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a role the contract stops answering fails', () => {
  const root = scratchRepository();
  const source = fs.readFileSync(path.join(root, CONTRACT), 'utf8');
  write(root, CONTRACT, source.replace(/^\s*indexStatus: 'indexStatus',$/m, ''));
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('indexStatus')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a role pointing at a field no interface declares fails', () => {
  const root = scratchRepository();
  const source = fs.readFileSync(path.join(root, CONTRACT), 'utf8');
  write(root, CONTRACT, source.replace("owner: 'owner',", "owner: 'tenant',"));
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('"tenant"')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('two roles sharing one field fails', () => {
  const root = scratchRepository();
  const source = fs.readFileSync(path.join(root, CONTRACT), 'utf8');
  write(root, CONTRACT, source.replace("acl: 'visibility',", "acl: 'owner',"));
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('answers both')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a mint site that uses the address as the identity fails', () => {
  const root = scratchRepository();
  write(
    root,
    'apps/web/lib/server/rogue-file.ts',
    [
      'export function rogue(asset: { url: string }) {',
      '  return createFileReference({',
      '    id: asset.url,',
      '    uri: asset.url,',
      '  });',
      '}',
    ].join('\n'),
  );
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('rogue-file.ts')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a mint site with a minted identity passes', () => {
  const root = scratchRepository();
  write(
    root,
    'apps/web/lib/server/good-file.ts',
    [
      'export function good(asset: { assetId: string; url: string }) {',
      '  return createFileReference({',
      '    id: asset.assetId,',
      '    uri: asset.url,',
      '  });',
      '}',
    ].join('\n'),
  );
  assert.deepEqual(evaluate(root).failures, []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a new module declaring its own extracted-text cap fails', () => {
  const root = scratchRepository();
  write(
    root,
    'apps/web/lib/server/second-cap.ts',
    [
      'export const MAX_SLIDE_TEXT_CHARS = 120_000;',
      'export function read(data: Buffer) {',
      '  return data.toString().slice(0, MAX_SLIDE_TEXT_CHARS);',
      '}',
    ].join('\n'),
  );
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('second-cap.ts')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a baseline entry that has been fixed is reported as stale', () => {
  const root = scratchRepository();
  const [first] = Object.keys(TEXT_LIMIT_BASELINE);
  const source = fs.readFileSync(path.join(root, first), 'utf8');
  write(root, first, source.replace(/export const MAX_[A-Z_]*TEXT_CHARS\s*=\s*[0-9_]+\s*;/, ''));
  const { failures } = evaluate(root);
  assert.ok(failures.some((failure) => failure.includes('stale baseline entry')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('every required role is named by the shipped contract', () => {
  const roles = declaredRoles(
    fs.readFileSync(path.join(REPO_ROOT, CONTRACT), 'utf8'),
    fs.readFileSync(path.join(REPO_ROOT, MODEL), 'utf8'),
  );
  for (const role of REQUIRED_ROLES) assert.ok(roles.has(role), `missing role ${role}`);
});

test('the identity reader finds the id of a multi-line call', () => {
  const identities = mintedIdentities(
    [
      'createManagedFile({',
      "  name: 'a.csv',",
      '  id: assetId,',
      "  uri: '/api/files/a',",
      '});',
    ].join('\n'),
  );
  assert.deepEqual(identities, [{ callee: 'createManagedFile', expression: 'assetId' }]);
});
