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

const LIBRARY = "export const LIBRARY_ITEM_KINDS = ['image', 'text', 'artifact'] as const;\n";

function baseTree() {
  return {
    'packages/contracts/types/src/conversation.ts': VOCABULARY,
    'packages/contracts/types/src/client-capability-manifest.ts': COMPATIBILITY,
    'packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts': DEGRADATION_TEST,
    'packages/contracts/cloud-contracts/src/library.ts': LIBRARY,
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

test('a client outside the shared packages that copies the vocabulary fails', () => {
  const files = baseTree();
  files['apps/mobile/src/features/chat/blockKinds.ts'] =
    "export const MOBILE_BLOCKS = ['text', 'image', 'tool_call'];\n";
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/mobile\/src\/features\/chat\/blockKinds\.ts: restates/);
});

test('a copy inside a test file is not a shipped vocabulary', () => {
  const files = baseTree();
  files['apps/extension/src/features/blocks.test.ts'] =
    "const FIXTURE = ['text', 'image', 'tool_call'];\n";
  const result = runOn(files);
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('a separate vocabulary that stops sharing block kinds fails until its entry goes', () => {
  const files = baseTree();
  files['packages/contracts/cloud-contracts/src/library.ts'] =
    "export const LIBRARY_ITEM_KINDS = ['image', 'document'] as const;\n";
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no longer shares block kinds with MESSAGE_KINDS/);
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

const AGENT_EVENT_UNION = `export type AgentEvent =
  | ({ type: 'text-delta' } & A)
  | ({ type: 'source-list' } & B)
  | ({ type: 'artifact-produced' } & C)
  | ({ type: 'stop' } & D);
`;

const KIND_MAPPING = `export const AGENT_EVENT_MESSAGE_KINDS = Object.freeze({
  'text-delta': 'text',
  'source-list': 'citation',
  'artifact-produced': 'artifact',
  stop: null,
});
export function messageKindForAgentEvent(type) { return AGENT_EVENT_MESSAGE_KINDS[type] ?? null; }
`;

const PRIVATE_CLASSIFIER = `export function section(event) {
  switch (event.type) {
    case 'text-delta': return 'body';
    case 'source-list': return 'sources';
    case 'artifact-produced': return 'files';
  }
}
`;

function eventTree(extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-content-blocks-'));
  sandboxes.push(dir);
  const files = {
    ...baseTree(),
    'packages/contracts/types/src/generated/protocol/AgentEvent.ts': AGENT_EVENT_UNION,
    'packages/contracts/types/src/message-block-kinds.ts': KIND_MAPPING,
    ...extra,
  };
  for (const [relative, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const absolute = path.join(dir, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return dir;
}

test('a client that decides blocks from event types without the mapping fails', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const dir = eventTree({ 'apps/extension/src/features/blocks.ts': PRIVATE_CLASSIFIER });
  const { findings } = runContentBlocksGuard(dir, { pending: {}, notReaders: {} });
  assert.ok(
    findings.some((finding) => /blocks\.ts: decides blocks from agent event types/.test(finding)),
    findings.join('\n'),
  );
});

test('a client that reads the kind through the mapping passes', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const dir = eventTree({
    'apps/extension/src/features/blocks.ts': `import { messageKindForAgentEvent } from '@agiworkforce/types';\n${PRIVATE_CLASSIFIER}`,
  });
  assert.deepEqual(runContentBlocksGuard(dir, { pending: {}, notReaders: {} }).findings, []);
});

test('a pending client that adopts the mapping fails until its entry goes', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const file = 'apps/mobile/src/features/blocks.ts';
  const pending = { [file]: 'mobile, post-codex patch: read kinds through the mapping' };
  const before = eventTree({ [file]: PRIVATE_CLASSIFIER });
  assert.deepEqual(runContentBlocksGuard(before, { pending, notReaders: {} }).findings, []);
  const after = eventTree({
    [file]: `import { messageKindForAgentEvent } from '@agiworkforce/types';\n${PRIVATE_CLASSIFIER}`,
  });
  assert.ok(
    runContentBlocksGuard(after, { pending, notReaders: {} }).findings.some((finding) =>
      /Delete its pending entry/.test(finding),
    ),
  );
});

test('a file recorded as not a block-kind reader passes, and only that exact path', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const listed = 'apps/desktop/electron/runtime/adapterChunks.ts';
  const notReaders = { [listed]: 'Reads provider-adapter chunks, a separate vocabulary.' };
  const dir = eventTree({
    [listed]: PRIVATE_CLASSIFIER,
    'apps/desktop/electron/runtime/adapterChunksCopy.ts': PRIVATE_CLASSIFIER,
  });
  const { findings } = runContentBlocksGuard(dir, { pending: {}, notReaders });
  assert.ok(
    findings.some((finding) =>
      /adapterChunksCopy\.ts: decides blocks from agent event types/.test(finding),
    ),
    findings.join('\n'),
  );
  assert.ok(!findings.some((finding) => finding.startsWith(`${listed}:`)), findings.join('\n'));
});

test('a not-a-reader entry that no longer matches the scan fails until it goes', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const listed = 'apps/desktop/electron/runtime/adapterChunks.ts';
  const notReaders = { [listed]: 'Reads provider-adapter chunks, a separate vocabulary.' };
  const dir = eventTree({ [listed]: 'export {};\n' });
  assert.ok(
    runContentBlocksGuard(dir, { pending: {}, notReaders }).findings.some((finding) =>
      /Delete its not-a-reader entry/.test(finding),
    ),
  );
});

test('a not-a-reader entry without a reason fails', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const listed = 'apps/desktop/electron/runtime/adapterChunks.ts';
  const dir = eventTree({ [listed]: PRIVATE_CLASSIFIER });
  assert.ok(
    runContentBlocksGuard(dir, { pending: {}, notReaders: { [listed]: 'n/a' } }).findings.some(
      (finding) => /not a block-kind reader without a reason/.test(finding),
    ),
  );
});

test('a mapping that leaves an event type out fails', async () => {
  const { runContentBlocksGuard } = await import('./check-content-blocks.mjs');
  const dir = eventTree({
    'packages/contracts/types/src/message-block-kinds.ts': KIND_MAPPING.replace(
      "  'source-list': 'citation',\n",
      '',
    ),
  });
  assert.ok(
    runContentBlocksGuard(dir, { pending: {}, notReaders: {} }).findings.some((finding) =>
      /maps no block kind for the event type 'source-list'/.test(finding),
    ),
  );
});
