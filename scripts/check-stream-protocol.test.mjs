import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-stream-protocol.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

const CONTRACT = `export interface StreamChunkText {
  type: 'text-delta';
  delta: string;
}

export interface StreamChunkUsage {
  type: 'usage';
  outputTokens?: number;
}

export interface StreamChunkStop {
  type: 'stop';
  reason: 'end_turn' | 'error';
}

export type StreamChunk = (
  | StreamChunkText
  | StreamChunkUsage
  | StreamChunkStop
) &
  StreamEnvelopeCarrier;
`;

const ENVELOPE = `export function streamChunkToAgentEvent(chunk) {
  switch (chunk.type) {
    case 'text-delta':
      return { type: 'text-delta', delta: chunk.delta };
    case 'usage':
      return { type: 'usage', outputTokens: chunk.outputTokens };
    case 'stop':
      return { type: 'stop', reason: chunk.reason };
  }
}
`;

const TRANSLATOR = `export async function* translateDemoStream(chunks) {
  for await (const chunk of chunks) {
    yield { type: 'text-delta', delta: chunk.text };
  }
  yield { type: 'stop', reason: 'end_turn' };
}
`;

const INDEX = `import { translateDemoStream } from './stream';
export const demo = { stream: translateDemoStream, entry: 'translateOpenAIStream' };
`;

const EMITTER_CALL_SITE = `import { createAgentEventStreamEmitter } from './agent-event-stream';

export function startTurn(processed) {
  const turnId = processed.requestId;
  return createAgentEventStreamEmitter({
    sessionId: processed.conversationId ?? turnId,
    turnId,
    responseModel: processed.requestedModel,
  });
}
`;

function baseTree() {
  return {
    'packages/contracts/types/src/provider-adapter.ts': CONTRACT,
    'packages/ai/provider-protocol/src/agent-event-envelope.ts': ENVELOPE,
    'packages/ai/providers/demo/src/stream.ts': TRANSLATOR,
    'packages/ai/providers/demo/src/index.ts': INDEX,
    'packages/ai/providers/demo/src/__tests__/stream-terminal-discipline.test.ts': 'export {};\n',
    'apps/web/lib/turn.ts': EMITTER_CALL_SITE,
  };
}

function runOn(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-stream-protocol-'));
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

test('a translator with no terminal-ordering test fails', () => {
  const files = baseTree();
  files['packages/ai/providers/demo/src/__tests__/stream-terminal-discipline.test.ts'] = null;
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stream-terminal-discipline\.test\.ts/);
});

test('a translator yielding a chunk type the contract never declares fails', () => {
  const files = baseTree();
  files['packages/ai/providers/demo/src/stream.ts'] = TRANSLATOR.replace(
    "yield { type: 'text-delta', delta: chunk.text };",
    "yield { type: 'token', delta: chunk.text };",
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /emits 'token'/);
});

test('a translator that never emits the terminal chunk fails', () => {
  const files = baseTree();
  files['packages/ai/providers/demo/src/stream.ts'] = TRANSLATOR.replace(
    "  yield { type: 'stop', reason: 'end_turn' };\n",
    '',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /never emits the terminal 'stop'/);
});

test('an envelope mapper that drops a declared chunk type fails', () => {
  const files = baseTree();
  files['packages/ai/provider-protocol/src/agent-event-envelope.ts'] = ENVELOPE.replace(
    "    case 'usage':\n      return { type: 'usage', outputTokens: chunk.outputTokens };\n",
    '',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /never handles 'usage'/);
});

test('a provider reaching no canonical translator fails', () => {
  const files = baseTree();
  files['packages/ai/providers/demo/src/index.ts'] = 'export const demo = { stream: null };\n';
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reaches no canonical stream translator/);
});

test('an emitter keyed on something other than the conversation fails', () => {
  const files = baseTree();
  files['apps/web/lib/turn.ts'] = EMITTER_CALL_SITE.replace(
    'processed.conversationId ?? turnId',
    'crypto.randomUUID()',
  );
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not derived from the conversation id/);
});

test('an emitter shorthand resolved from a conversation-derived local passes', () => {
  const files = baseTree();
  files['apps/web/lib/turn.ts'] = EMITTER_CALL_SITE.replace(
    '    sessionId: processed.conversationId ?? turnId,\n',
    '    sessionId,\n',
  ).replace(
    '  const turnId = processed.requestId;\n',
    '  const turnId = processed.requestId;\n  const sessionId = processed.conversationId ?? turnId;\n',
  );
  const result = runOn(files);
  assert.equal(result.status, 0, `${result.stderr}${result.stdout}`);
});

test('a tree with no emitter call site at all fails', () => {
  const files = baseTree();
  files['apps/web/lib/turn.ts'] = null;
  const result = runOn(files);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /found no agent event emitter call site/);
});

test('a contract with no StreamChunk union is reported rather than passed', () => {
  const files = baseTree();
  files['packages/contracts/types/src/provider-adapter.ts'] = 'export {};\n';
  const result = runOn(files);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /declares no StreamChunk union/);
});
