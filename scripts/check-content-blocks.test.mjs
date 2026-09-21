import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-content-blocks.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const VOCABULARY = `export const MESSAGE_KINDS = [
  'text',
  'image',
  'tool_call',
  'artifact',
] as const;

export type MessageKind = (typeof MESSAGE_KINDS)[number];
`;

const COMPATIBILITY = `import { MESSAGE_KINDS, type MessageKind } from './conversation';

export function readClientCapabilityManifest(payload) {
  const renderableBlocks = claimed.filter((entry) => MESSAGE_KINDS.includes(entry));
  const unknownBlocks = claimed.filter((entry) => !MESSAGE_KINDS.includes(entry));
  return { renderableBlocks, unknownBlocks };
}
`;

const DEGRADATION_TEST = `import { MESSAGE_KINDS, degradeUnsupported } from '@agiworkforce/types';

it('degrades every declared kind', () => {
  for (const kind of MESSAGE_KINDS) expect(degradeUnsupported([kind], manifest)).toHaveLength(1);
});
`;

function baseTree() {
  return {
    'packages/contracts/types/src/conversation.ts': VOCABULARY,
    'packages/contracts/types/src/client-capability-manifest.ts': COMPATIBILITY,
    'packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts': DEGRADATION_TEST,
  };
}

function runOn(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-content-blocks-'));
  sandboxes.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const absolute = path.join(dir, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return spawnSync(process.execPath, [GUARD], { cwd: dir, encoding: 'utf8' });
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('a conforming synthetic tree passes', () => {
  const result = runOn(baseTree());
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('a kind that is not a stable lowercase identifier fails', () => {
  const files = baseTree();
  files['packages/contracts/types/src/conversation.ts'] = VOCABULARY.replace(
    "'tool_call',",
    "'Tool Call',",
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not a stable lowercase identifier/);
});

test('a second copy of the vocabulary fails', () => {
  const files = baseTree();
  files['packages/ui/unified-chat/src/lib/blocks.ts'] =
    "export const RENDERED = ['text', 'image', 'artifact'];\n";
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /restates the block vocabulary/);
});

test('a degradation test that names kinds by hand fails', () => {
  const files = baseTree();
  files['packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts'] =
    DEGRADATION_TEST.replace('for (const kind of MESSAGE_KINDS)', "for (const kind of ['text'])");
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hard-codes the kind 'text'/);
});

test('a missing degradation test fails', () => {
  const files = baseTree();
  files['packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts'] = null;
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is missing, so no kind's degradation is proven/);
});

test('a compatibility reader that stops reporting unknown blocks fails', () => {
  const files = baseTree();
  files['packages/contracts/types/src/client-capability-manifest.ts'] = COMPATIBILITY.replaceAll(
    'unknownBlocks',
    'ignored',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not read 'unknownBlocks'/);
});

test('a vocabulary with no MESSAGE_KINDS is reported rather than passed', () => {
  const files = baseTree();
  files['packages/contracts/types/src/conversation.ts'] = 'export {};\n';
  const result = runOn(files);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /declares no MESSAGE_KINDS/);
});
