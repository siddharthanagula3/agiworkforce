import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CANONICAL_DIR,
  CAPABILITY_CONSUMER,
  CRATE_BINDINGS_DIR,
  TOOL_PRIMITIVE,
  checkProtocolTypes,
  compareTrees,
  compareVocabulary,
  collectModules,
  fieldsOfGeneratedType,
  normalizeDeclaration,
  runtimeListing,
  stringUnionMembers,
  zodObjectKeys,
} from './check-protocol-types.mjs';

const TS_RS = `export type Thing = { url: string, title: string, mode?: "fast" | "slow", };\n`;
const PRETTIER = `export type Thing = {\n  url: string;\n  title: string;\n  mode?: 'fast' | 'slow';\n};\n`;

const CAPABILITY_SOURCE = `export type AppServerCapabilities = {
  threads: boolean;
  /** A doc comment that is not a field. */
  reconnect?: boolean;
};
`;

const TOOL_UNION = `export type ToolActionClass = 'read' | 'write';\n`;
const TOOL_PRIMITIVE_SOURCE = `export const TOOL_ACTION_CLASSES = listing<ToolActionClass>()(['read', 'write']);\n`;

function consumerSource(keys) {
  return `const capabilitiesSchema = z.object({\n${keys
    .map((key) => `  ${key}: z.boolean(),`)
    .join('\n')}\n});\n`;
}

function fixtureRoot(over = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-parity-'));
  const files = {
    [path.join(CANONICAL_DIR, 'AppServerCapabilities.ts')]: CAPABILITY_SOURCE,
    [path.join(CANONICAL_DIR, 'ToolActionClass.ts')]: TOOL_UNION,
    [path.join(CRATE_BINDINGS_DIR, 'AppServerCapabilities.ts')]: CAPABILITY_SOURCE,
    [path.join(CRATE_BINDINGS_DIR, 'ToolActionClass.ts')]: TOOL_UNION,
    [CAPABILITY_CONSUMER]: consumerSource(['threads', 'reconnect']),
    [TOOL_PRIMITIVE]: TOOL_PRIMITIVE_SOURCE,
    ...over,
  };
  for (const [relative, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

test('formatting alone is not divergence', () => {
  assert.equal(normalizeDeclaration(TS_RS), normalizeDeclaration(PRETTIER));
});

test('a leading union pipe and a wrapped intersection are formatting too', () => {
  const tsRs = `export type A = {"type": "x"} & X | {"type": "y"} & Y;`;
  const pretty = `export type A =\n  | ({ type: 'x' } & X)\n  | ({ type: 'y' } & Y);`;
  assert.equal(normalizeDeclaration(tsRs), normalizeDeclaration(pretty));
});

test('a changed field is divergence', () => {
  const changed = PRETTIER.replace('title: string;', 'title: number;');
  assert.notEqual(normalizeDeclaration(TS_RS), normalizeDeclaration(changed));
});

test('an added field is divergence', () => {
  const extra = PRETTIER.replace('};', '  extra: boolean;\n};');
  assert.notEqual(normalizeDeclaration(TS_RS), normalizeDeclaration(extra));
});

test('a comment is not part of the declaration', () => {
  const commented = `/** A note nobody generated the same way. */\n${PRETTIER}`;
  assert.equal(normalizeDeclaration(PRETTIER), normalizeDeclaration(commented));
});

test('a tree comparison names both directions of a missing module', () => {
  const canonical = new Map([['A.ts', 'export type A = string;']]);
  const mirror = new Map([['B.ts', 'export type B = string;']]);

  const problems = compareTrees(canonical, mirror);

  assert.equal(problems.length, 2);
  assert.match(problems.join('\n'), /A\.ts is generated but missing from the crate tree/);
  assert.match(problems.join('\n'), /B\.ts is in the crate tree but no longer generated/);
});

test('fields are read without the doc comments between them', () => {
  assert.deepEqual(fieldsOfGeneratedType(CAPABILITY_SOURCE, 'AppServerCapabilities'), [
    'threads',
    'reconnect',
  ]);
});

test('an unreadable shape is a problem, never a silent pass', () => {
  assert.deepEqual(compareVocabulary('X', null, ['a']), [
    'X: the Rust-owned shape could not be read',
  ]);
  assert.deepEqual(compareVocabulary('X', ['a'], null), [
    'X: the hand-written mirror could not be read',
  ]);
  assert.deepEqual(compareVocabulary('X', ['a'], ['a']), []);
});

test('zod keys are read from the mirrored schema', () => {
  assert.deepEqual(zodObjectKeys(consumerSource(['threads', 'reconnect']), 'capabilitiesSchema'), [
    'threads',
    'reconnect',
  ]);
  assert.equal(zodObjectKeys('const other = z.object({});', 'capabilitiesSchema'), null);
});

test('a string union and its runtime listing are read as member lists', () => {
  assert.deepEqual(stringUnionMembers(TOOL_UNION, 'ToolActionClass'), ['read', 'write']);
  assert.equal(stringUnionMembers('export type T = { a: string };', 'T'), null);
  assert.deepEqual(runtimeListing(TOOL_PRIMITIVE_SOURCE, 'ToolActionClass'), ['read', 'write']);
  assert.equal(runtimeListing(TOOL_PRIMITIVE_SOURCE, 'ToolAuthKind'), null);
});

test('modules are collected recursively and the barrel is not one of them', () => {
  const root = fixtureRoot({
    [path.join(CANONICAL_DIR, 'index.ts')]: "export * from './ToolActionClass';\n",
    [path.join(CANONICAL_DIR, 'nested', 'Inner.ts')]: 'export type Inner = string;\n',
  });

  const modules = collectModules(path.join(root, CANONICAL_DIR));

  assert.equal(modules.has('index.ts'), false);
  assert.equal(modules.has('nested/Inner.ts'), true);
});

test('a tree that agrees on every count passes', () => {
  const { problems, checked } = checkProtocolTypes(fixtureRoot());

  assert.deepEqual(problems, []);
  assert.equal(checked, 2);
});

test('a stale crate mirror fails', () => {
  const root = fixtureRoot({
    [path.join(CRATE_BINDINGS_DIR, 'ToolActionClass.ts')]:
      "export type ToolActionClass = 'read';\n",
  });

  const { problems } = checkProtocolTypes(root);

  assert.deepEqual(problems, ['ToolActionClass.ts declares a different shape in the two trees']);
});

test('a capability Rust added and the extension never mirrored fails', () => {
  const root = fixtureRoot({ [CAPABILITY_CONSUMER]: consumerSource(['threads']) });

  const { problems } = checkProtocolTypes(root);

  assert.deepEqual(problems, [
    'AppServerCapabilities: reconnect is owned by Rust but not mirrored',
  ]);
});

test('a capability the extension invented fails', () => {
  const root = fixtureRoot({
    [CAPABILITY_CONSUMER]: consumerSource(['threads', 'reconnect', 'teleport']),
  });

  const { problems } = checkProtocolTypes(root);

  assert.deepEqual(problems, [
    'AppServerCapabilities: teleport is mirrored but Rust declares no such member',
  ]);
});

test('a generated tool vocabulary with no runtime listing fails', () => {
  const root = fixtureRoot({ [TOOL_PRIMITIVE]: 'export const NOTHING = [];\n' });

  const { problems } = checkProtocolTypes(root);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /ToolActionClass is a generated tool vocabulary with no listing/);
});

test('a runtime listing that drifted from the generated members fails', () => {
  const root = fixtureRoot({
    [TOOL_PRIMITIVE]: "export const X = listing<ToolActionClass>()(['read', 'purge']);\n",
  });

  const { problems } = checkProtocolTypes(root);

  assert.deepEqual(problems, [
    'ToolActionClass: write is owned by Rust but not mirrored',
    'ToolActionClass: purge is mirrored but Rust declares no such member',
  ]);
});

test('an empty canonical tree is a failure rather than a vacuous pass', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-parity-empty-'));

  const { problems } = checkProtocolTypes(root);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /holds no generated modules/);
});
