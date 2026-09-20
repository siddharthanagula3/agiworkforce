import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkRegistryReferences,
  findUncheckedCasts,
  loadContract,
  readMembers,
} from './check-registry-references.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const VOCABULARY_SOURCE =
  "export const PROBE_MODES = ['fast', 'slow'] as const;\n" +
  'export type ProbeMode = (typeof PROBE_MODES)[number];\n' +
  'export function isProbeMode(value: unknown): value is ProbeMode {\n' +
  '  return typeof value === "string" && (PROBE_MODES as readonly string[]).includes(value);\n' +
  '}\n';

function contractFor(overrides = {}) {
  return {
    why: 'governed vocabularies',
    vocabularies: [
      {
        name: 'probe mode',
        file: 'packages/contracts/types/src/probe.ts',
        symbol: 'PROBE_MODES',
        type: 'ProbeMode',
        predicate: 'isProbeMode',
      },
    ],
    castRoots: ['apps/web/lib'],
    castDefects: [],
    ...overrides,
  };
}

function fixture(contract = contractFor(), files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'registry-references-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, CONTRACT_PATH, JSON.stringify(contract));
  write(root, 'packages/contracts/types/src/probe.ts', VOCABULARY_SOURCE);
  write(root, 'apps/web/lib/probe-service.ts', "export const mode = 'fast';\n");
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  assert.deepEqual(checkRegistryReferences(REPO_ROOT).errors, []);
});

test('every governed vocabulary in the shipped contract resolves to members', () => {
  for (const vocabulary of loadContract(REPO_ROOT).vocabularies) {
    const members = readMembers({ repoRoot: REPO_ROOT, vocabulary });
    assert.ok(members !== null && members.length > 0, vocabulary.name);
  }
});

test('a clean vocabulary passes', () => {
  assert.deepEqual(checkRegistryReferences(fixture()).errors, []);
});

test('a member declared twice fails', () => {
  const root = fixture(contractFor(), {
    'packages/contracts/types/src/probe.ts': VOCABULARY_SOURCE.replace(
      "['fast', 'slow']",
      "['fast', 'slow', 'fast']",
    ),
  });
  const { errors } = checkRegistryReferences(root);
  assert.ok(
    errors.some((error) => error.includes('declares "fast" twice')),
    errors.join('\n'),
  );
});

test('a vocabulary that loses its predicate fails', () => {
  const root = fixture(contractFor(), {
    'packages/contracts/types/src/probe.ts':
      "export const PROBE_MODES = ['fast', 'slow'] as const;\nexport type ProbeMode = (typeof PROBE_MODES)[number];\n",
  });
  const { errors } = checkRegistryReferences(root);
  assert.ok(
    errors.some((error) => error.includes('no longer exports isProbeMode')),
    errors.join('\n'),
  );
});

test('a vocabulary with no predicate and no recorded gap fails', () => {
  const contract = contractFor();
  contract.vocabularies[0].predicate = null;
  const { errors } = checkRegistryReferences(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('owns no predicate and records no gap')),
    errors.join('\n'),
  );
});

test('a predicate gap the vocabulary has since closed is stale and fails', () => {
  const contract = contractFor();
  contract.vocabularies[0].predicate = null;
  contract.vocabularies[0].predicateGap = { why: 'nothing admits it', fix: 'export the predicate' };
  const { errors } = checkRegistryReferences(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('the predicate gap is stale')),
    errors.join('\n'),
  );
});

test('an unrecorded cast into a governed type fails', () => {
  const root = fixture(contractFor(), {
    'apps/web/lib/probe-service.ts':
      'export function read(input: string) {\n  return input as ProbeMode;\n}\n',
  });
  const { errors } = checkRegistryReferences(root);
  assert.ok(
    errors.some((error) => error.includes('casts a value into ProbeMode')),
    errors.join('\n'),
  );
});

test('reading the keys of a record the vocabulary types is not a cast', () => {
  const casts = findUncheckedCasts({
    repoRoot: fixture(contractFor(), {
      'apps/web/lib/probe-service.ts':
        'export const modes = Object.keys(PROBE_LABELS) as ProbeMode[];\n',
    }),
    files: ['apps/web/lib/probe-service.ts'],
    roots: ['apps/web/lib'],
    types: ['ProbeMode'],
  });
  assert.deepEqual(casts, []);
});

test('a recorded cast that has since been removed is stale and fails', () => {
  const contract = contractFor({
    castDefects: [
      {
        file: 'apps/web/lib/probe-service.ts',
        type: 'ProbeMode',
        why: 'unchecked',
        fix: 'guard it',
      },
    ],
  });
  const { errors } = checkRegistryReferences(fixture(contract));
  assert.ok(
    errors.some((error) => error.includes('no longer matches a cast')),
    errors.join('\n'),
  );
});

test('a recorded cast with no fix fails', () => {
  const contract = contractFor({
    castDefects: [{ file: 'apps/web/lib/probe-service.ts', type: 'ProbeMode', why: 'unchecked' }],
  });
  const root = fixture(contract, {
    'apps/web/lib/probe-service.ts':
      'export function read(input: string) {\n  return input as ProbeMode;\n}\n',
  });
  const { errors } = checkRegistryReferences(root);
  assert.ok(
    errors.some((error) => error.includes('cast defect carries no fix')),
    errors.join('\n'),
  );
});
