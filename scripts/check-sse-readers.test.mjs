import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PENDING,
  REPO_ROOT,
  SERVER_MODULES,
  SHARED_READER,
  checkSseReaders,
  framesServerSentEventsByHand,
} from './check-sse-readers.mjs';

const roots = [];

const HAND_FRAMED = `export async function read(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (const line of buffer.split('\\n')) {
      if (line.startsWith('data: ')) console.log(line.slice(6));
    }
  }
}
`;

function fixture({ edits = {}, added = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'agi-sse-readers-'));
  roots.push(root);
  for (const relative of [SHARED_READER, ...Object.keys(PENDING), ...Object.keys(SERVER_MODULES)]) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(REPO_ROOT, relative), destination);
  }
  for (const [relative, edit] of Object.entries(edits)) {
    const absolute = path.join(root, relative);
    writeFileSync(absolute, edit(readFileSync(absolute, 'utf8')));
  }
  for (const [relative, source] of Object.entries(added)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the tree as it stands reads server-sent events through the shared reader', () => {
  assert.deepEqual(checkSseReaders(REPO_ROOT), []);
  assert.deepEqual(checkSseReaders(fixture()), []);
});

test('a client that frames the stream by hand fails', () => {
  const root = fixture({ added: { 'apps/web/features/example/stream.ts': HAND_FRAMED } });
  assert.ok(
    checkSseReaders(root).some((entry) =>
      /example\/stream\.ts frames a server-sent event stream by hand/.test(entry),
    ),
  );
});

test('a client that keeps its own spec decoder fails', () => {
  const root = fixture({
    added: {
      'apps/extension/src/features/example/decoder.ts':
        "export function line(field: string) { if (field !== 'data') return; }\n",
    },
  });
  assert.ok(checkSseReaders(root).some((entry) => /example\/decoder\.ts frames/.test(entry)));
});

test('a pending client that adopts the shared reader fails until its entry goes', () => {
  const file = 'apps/mobile/services/example-stream.ts';
  const pending = {
    ...PENDING,
    [file]: 'mobile, post-codex patch: read through the shared reader',
  };
  const before = fixture({ added: { [file]: HAND_FRAMED } });
  assert.deepEqual(checkSseReaders(before, { pending }), []);
  const after = fixture({
    added: {
      [file]:
        "import { readServerSentEvents } from '@agiworkforce/client-runtime';\nexport const read = readServerSentEvents;\n",
    },
  });
  assert.ok(
    checkSseReaders(after, { pending }).some((entry) =>
      /example-stream\.ts no longer frames SSE by hand/.test(entry),
    ),
  );
});

test('the shared reader losing its decoder fails', () => {
  const root = fixture({
    edits: {
      [SHARED_READER]: (source) =>
        source.replace('export class ServerSentEventDecoder', 'class ServerSentEventDecoder'),
    },
  });
  assert.ok(
    checkSseReaders(root).some((entry) => /no longer exports ServerSentEventDecoder/.test(entry)),
  );
});

test('only hand framing counts, and importing the shared reader clears a module', () => {
  assert.equal(framesServerSentEventsByHand(HAND_FRAMED), true);
  assert.equal(
    framesServerSentEventsByHand(
      `import { readServerSentEvents } from '@agiworkforce/client-runtime';\n${HAND_FRAMED}`,
    ),
    false,
  );
  assert.equal(framesServerSentEventsByHand("const url = 'data:image/png;base64,';"), false);
});
