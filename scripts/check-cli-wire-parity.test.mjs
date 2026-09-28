import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  EQUAL_CONSTANTS,
  JSON_BODY_PAIRS,
  LIMIT_PAIRS,
  REPO_ROOT,
  STRUCT_PAIRS,
  auditRepository,
  compareStruct,
  jsonBodyKeys,
  parseRustStructs,
  readTsShape,
} from './check-cli-wire-parity.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-cli-wire-parity.mjs');

const sandboxes = [];
function sandboxCopy() {
  const root = mkdtempSync(path.join(tmpdir(), 'check-cli-wire-parity-'));
  sandboxes.push(root);
  const files = new Set(
    [...STRUCT_PAIRS, ...JSON_BODY_PAIRS, ...LIMIT_PAIRS, ...EQUAL_CONSTANTS].flatMap((pair) => [
      pair.rust,
      pair.ts,
    ]),
  );
  files.add('packages/contracts/types/src/memory-wire.ts');
  files.add('packages/contracts/cloud-contracts/src/projects.ts');
  for (const file of files) {
    cpSync(path.join(REPO_ROOT, file), path.join(root, file), { recursive: true });
  }
  return root;
}

function rewrite(root, file, from, to) {
  const absolute = path.join(root, file);
  const source = readFileSync(absolute, 'utf8');
  assert.ok(source.includes(from), `${file} no longer contains ${from}`);
  writeFileSync(absolute, source.replace(from, to), 'utf8');
}

after(() => {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true });
});

test('reads serde wire names, renames, skips and optionality', () => {
  const structs = parseRustStructs(
    [
      '#[derive(Serialize)]',
      '#[serde(rename_all = "camelCase")]',
      'pub struct Push {',
      '    pub base_version: String,',
      '    #[serde(rename = "kind")]',
      '    pub item_kind: String,',
      '    #[serde(skip_serializing_if = "Option::is_none")]',
      '    pub category: Option<String>,',
      '    #[serde(skip)]',
      '    pub local_only: bool,',
      '}',
      '',
      'struct Delta {',
      '    #[serde(default)]',
      '    is_deleted: bool,',
      "    owner: Holder<'static>,",
      '}',
    ].join('\n'),
  );
  assert.deepEqual(
    structs.get('Push').fields.map((field) => field.wire),
    ['baseVersion', 'kind', 'category'],
  );
  const category = structs.get('Push').fields[2];
  assert.equal(category.option, true);
  assert.equal(category.skippedWhenEmpty, true);
  const [isDeleted, owner] = structs.get('Delta').fields;
  assert.equal(isDeleted.wire, 'is_deleted');
  assert.equal(isDeleted.defaulted, true);
  assert.equal(owner.option, false);
});

test('reads zod keys at the top level only, through comments and spreads', () => {
  const source = [
    'const Shared = {',
    '  note: z.string().max(40).nullable().optional(),',
    '};',
    'export const ItemSchema = z',
    '  .object({',
    "    /** The owner's id; never null. */",
    '    id: z.string(),',
    '    rows: z.array(z.object({ inner: z.string().optional() })),',
    '    size: z.number().max(LIMIT),',
    '    ...Shared,',
    '  })',
    '  .strict();',
    'export interface Response {',
    '  items: string[];',
    '  cursor?: string;',
    '  owner: string | null;',
    '}',
  ].join('\n');
  const schema = readTsShape(source, 'ItemSchema');
  assert.deepEqual([...schema.keys()], ['id', 'rows', 'size', 'note']);
  assert.equal(schema.get('rows').optional, false);
  assert.equal(schema.get('size').max, 'LIMIT');
  assert.deepEqual(schema.get('note'), { optional: true, nullable: true, max: '40' });
  const shape = readTsShape(source, 'Response');
  assert.equal(shape.get('items').optional, false);
  assert.equal(shape.get('cursor').optional, true);
  assert.equal(shape.get('owner').nullable, true);
  assert.equal(readTsShape(source, 'Missing'), null);
});

test('finds the keys of every json! body a function sends', () => {
  const source = [
    "fn archive<'a>(id: &'a str, archived: bool) -> Value {",
    "    let quote = '{';",
    '    let body = serde_json::json!({ "isArchived": archived, "note": format!("{id}") });',
    '    body',
    '}',
  ].join('\n');
  assert.deepEqual(jsonBodyKeys(source, 'archive'), [['isArchived', 'note']]);
  assert.equal(jsonBodyKeys(source, 'missing'), null);
});

test('flags each way a struct can disagree with its contract', () => {
  const key = (optional, nullable) => ({ optional, nullable, max: null });
  const field = (name, overrides = {}) => ({
    name,
    wire: name,
    option: false,
    defaulted: false,
    skippedWhenEmpty: false,
    ...overrides,
  });
  const sends = { rust: 'a.rs', struct: 'S', ts: 'b.ts', shape: 'T', direction: 'sends' };
  const reads = { ...sends, direction: 'reads' };

  assert.deepEqual(
    compareStruct(sends, { fields: [field('id')] }, new Map([['id', key(false, false)]])),
    [],
  );
  assert.match(
    compareStruct(
      sends,
      { fields: [field('id'), field('extra')] },
      new Map([['id', key(false, false)]]),
    )[0],
    /"extra", which the contract does not have/,
  );
  assert.match(
    compareStruct(sends, { fields: [] }, new Map([['id', key(false, false)]]))[0],
    /requires "id", which the CLI never sends/,
  );
  assert.match(
    compareStruct(
      sends,
      { fields: [field('note', { option: true })] },
      new Map([['note', key(true, false)]]),
    )[0],
    /sends null for "note"/,
  );
  assert.match(
    compareStruct(reads, { fields: [field('owner')] }, new Map([['owner', key(false, true)]]))[0],
    /must be an Option/,
  );
  assert.match(
    compareStruct(reads, { fields: [field('cursor')] }, new Map([['cursor', key(true, false)]]))[0],
    /needs #\[serde\(default\)\] or an Option/,
  );
  assert.deepEqual(
    compareStruct(
      reads,
      { fields: [field('cursor', { defaulted: true })] },
      new Map([['cursor', key(true, false)]]),
    ),
    [],
  );
});

test('the CLI in this repository matches the shared contracts', () => {
  const { checked, problems } = auditRepository(REPO_ROOT);
  assert.deepEqual(problems, []);
  assert.equal(
    checked,
    STRUCT_PAIRS.length + JSON_BODY_PAIRS.length + LIMIT_PAIRS.length + EQUAL_CONSTANTS.length,
  );
  const run = spawnSync(process.execPath, [GUARD], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /match the shared contracts/);
});

test('catches a renamed field, a raised limit and a moved protocol version', () => {
  const root = sandboxCopy();
  rewrite(
    root,
    'apps/cli/src/cloud/memory.rs',
    'pub base_version: String,',
    'pub base_revision: String,',
  );
  rewrite(
    root,
    'apps/cli/src/cloud/projects.rs',
    'const NAME_MAX_CHARS: usize = 200;',
    'const NAME_MAX_CHARS: usize = 500;',
  );
  rewrite(
    root,
    'apps/cli/src/cloud/memory.rs',
    'pub const SYNC_PROTOCOL_VERSION: u8 = 2;',
    'pub const SYNC_PROTOCOL_VERSION: u8 = 3;',
  );
  const { problems } = auditRepository(root);
  assert.ok(
    problems.some((problem) => /"baseRevision", which the contract does not have/.test(problem)),
  );
  assert.ok(
    problems.some((problem) => /requires "baseVersion", which the CLI never sends/.test(problem)),
  );
  assert.ok(problems.some((problem) => /NAME_MAX_CHARS is 500, above the 200/.test(problem)));
  assert.ok(problems.some((problem) => /SYNC_PROTOCOL_VERSION is 3, but/.test(problem)));
});

test('catches a contract that starts sending null to a field the CLI requires', () => {
  const root = sandboxCopy();
  rewrite(
    root,
    'packages/contracts/cloud-contracts/src/sync.ts',
    'export const MemoryWireDeltaSchema = z.object({\n  id: z.string(),\n  content: z.string(),',
    'export const MemoryWireDeltaSchema = z.object({\n  id: z.string(),\n  content: z.string().nullable(),',
  );
  const { problems } = auditRepository(root);
  assert.ok(problems.some((problem) => /MemoryDelta .*"content" may be null/.test(problem)));
});
