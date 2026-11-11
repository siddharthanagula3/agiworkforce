import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev/Desktop.app');
const manifest = JSON.parse(
  fs.readFileSync(path.join(bundle, 'Contents/Resources/native-runtime.json'), 'utf8'),
);
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json',
    ),
    'utf8',
  ),
);
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-cloud-fixture-'));
const jwt = `fixture.${Buffer.from(JSON.stringify({ sub: 'fixture-account', sid: 'fixture-device' })).toString('base64url')}.signature`;
const counts = { list: 0, read: 0, rejected: 0 };
let serverError;
const histories = new Map(
  ['long', 'moving', 'unstable', 'empty', 'missing'].map((name) => {
    const id = randomUUID();
    const messages = ['empty', 'missing'].includes(name)
      ? []
      : Array.from({ length: 123 }, (_, index) => ({
          ...fixture.read.messages[0],
          id: randomUUID(),
          role: index % 2 === 0 ? 'assistant' : 'user',
          content: `Message ${index} 🦀`,
          created_at: new Date(Date.UTC(2026, 10, 9, 0, 0, index)).toISOString(),
        }));
    return [id, { id, name, messages, reads: 0 }];
  }),
);
const server = http.createServer((request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${jwt}`);
    assert.equal(request.method, 'GET');
    const url = new URL(request.url, 'http://127.0.0.1');
    let body;
    if (url.pathname === '/api/chat/conversations') {
      assert.equal(url.searchParams.get('limit'), '2');
      counts.list += 1;
      assert.equal(url.searchParams.get('q'), 'fixture');
      if (url.searchParams.get('offset') === '0') body = fixture.list;
      else {
        assert.equal(url.searchParams.get('offset'), '1');
        assert.equal(url.searchParams.get('cursor'), 'opaque-next');
        body = { conversations: [], hasMore: false, nextOffset: 1, nextCursor: null };
      }
    } else {
      counts.read += 1;
      const history = histories.get(url.pathname.split('/').at(-1));
      if (history) {
        history.reads += 1;
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset'));
        if (
          limit > 1 &&
          (history.name === 'unstable' || (history.name === 'moving' && history.reads === 2))
        ) {
          const index = history.messages.length;
          history.messages.push({
            ...fixture.read.messages[0],
            id: randomUUID(),
            role: 'assistant',
            content: `Message ${index} 🦀`,
            created_at: new Date(Date.UTC(2026, 10, 9, 0, 0, index)).toISOString(),
          });
        }
        const messages = history.messages.slice(offset, offset + limit);
        body = {
          conversation: { ...fixture.read.conversation, id: history.id },
          messages,
          hasMore: offset + messages.length < history.messages.length,
          ...(history.name === 'missing' ? {} : { total: history.messages.length }),
        };
      } else {
        assert.equal(url.pathname, `/api/chat/conversations/${fixture.read.conversation.id}`);
        assert.equal(url.searchParams.get('limit'), '2');
        body = fixture.read;
      }
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  } catch (error) {
    serverError = error;
    counts.rejected += 1;
    response.writeHead(500);
    response.end('{}');
  }
});

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const env = {
    ...process.env,
    AGIWORKFORCE_HOME: configRoot,
    AGIWORKFORCE_API_BASE: origin,
    AGI_AUTH_BASE: `${origin}/api`,
    AGIWORKFORCE_JWT: jwt,
    AGI_GPUI_HISTORY_FIXTURE: '1',
    AGI_GPUI_TEST_RUNTIME: path.join(bundle, 'Contents/MacOS', manifest.executable),
    ...Object.fromEntries(
      [...histories.values()].map((history) => [
        `AGI_GPUI_HISTORY_${history.name.toUpperCase()}_ID`,
        history.id,
      ]),
    ),
  };
  const child = spawn(
    'cargo',
    [
      'test',
      '-p',
      'agiworkforce-desktop-gpui',
      '--no-default-features',
      '--features',
      'cloud-fixture-test',
      '--test',
      'runtime',
      'real_cloud_history_',
      '--',
      '--ignored',
    ],
    { cwd: root, env, stdio: 'inherit' },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (serverError) throw serverError;
  assert.equal(code, 0, 'The real-runtime Cloud fixture test failed');
  assert.deepEqual(counts, { list: 2, read: 13, rejected: 0 });
  for (const history of histories.values())
    assert.equal(
      history.reads,
      { long: 4, moving: 3, unstable: 3, empty: 1, missing: 1 }[history.name],
    );
  process.stdout.write(
    'Real CLI latest/older history, concurrent updates, empty/count errors and scope refusal passed.\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(configRoot, { recursive: true, force: true });
}
