import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev/Desktop.app');
const manifest = JSON.parse(
  fs.readFileSync(path.join(bundle, 'Contents/Resources/native-runtime.json'), 'utf8'),
);
const golden = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json',
    ),
    'utf8',
  ),
);
const conversationContract = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/contracts/cloud-contracts/src/conversation-contract.json'),
    'utf8',
  ),
);
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-chat-fixture-'));
const jwt = `fixture.${Buffer.from(JSON.stringify({ sub: 'chat-fixture', sid: 'chat-device' })).toString('base64url')}.signature`;
let conversation;
const messages = [];
const savedAttachment = {
  id: 'web-file',
  assetId: '77777777-7777-4777-8777-777777777777',
  type: 'file',
  name: 'report 東京.txt',
  size: 17,
  mimeType: 'text/plain',
};
const runs = new Map();
let posts = 0;
let cancellations = 0;
let firstStream;
let fixtureError;
let catalogueState = 'valid';
let catalogueReads = 0;
let revision = 1;
let metadataWrites = 0;
let draftWrites = 0;
let lostDraftResponses = 0;
let modelWrites = 0;
let lostResponseAttempts = 0;
let omitRevision = false;
let activeWorkspace = conversationContract.personalWorkspace;
let contextMode = 'normal';
const json = (response, body) => {
  response.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};
const finish = (stream, text, state) => {
  if (stream.response.writableEnded) return;
  messages.push({ ...golden.read.messages[0], id: stream.assistantId, content: text });
  stream.run.state = state;
  stream.response.end(
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] })}\n\ndata: [DONE]\n\n`,
  );
};
const server = http.createServer(async (request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${jwt}`);
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/models/catalogue') {
      catalogueReads += 1;
      const models = [
        {
          id: 'fixture-selected-model',
          displayName: 'Fixture selected model',
          developerLabel: 'Fixture developer',
          admitted: true,
          temporarilyUnavailable: false,
          minimumPlanLabel: null,
        },
        {
          id: 'fixture-blocked-model',
          displayName: 'Fixture blocked model',
          developerLabel: 'Fixture developer',
          admitted: false,
          temporarilyUnavailable: false,
          minimumPlanLabel: 'Other plan',
        },
        {
          id: 'fixture-degraded-model',
          displayName: 'Fixture unavailable model',
          developerLabel: 'Fixture developer',
          admitted: true,
          temporarilyUnavailable: true,
          minimumPlanLabel: null,
        },
      ];
      if (catalogueState === 'malformed') models.push(models[0]);
      json(response, { models, count: models.length, planLabel: 'Fixture plan' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/chat/conversations') {
      if (url.searchParams.get('q') === 'malformed-catalogue') catalogueState = 'malformed';
      if (url.searchParams.get('q') === 'restore-catalogue') catalogueState = 'valid';
      if (url.searchParams.get('q') === 'omit-revision') omitRevision = true;
      if (url.searchParams.get('q') === 'restore-revision') omitRevision = false;
      if (url.searchParams.get('q') === 'broken-attachment')
        messages[0].metadata = { attachments: [{ name: 'missing-id.txt' }] };
      if (url.searchParams.get('q') === 'restore-attachment')
        messages[0].metadata = { attachments: [savedAttachment] };
      if (url.searchParams.get('q') === 'oversized-context') contextMode = 'oversized';
      if (url.searchParams.get('q') === 'foreign-context') contextMode = 'foreign';
      if (url.searchParams.get('q') === 'restore-context') contextMode = 'normal';
      if (url.searchParams.get('q') === 'switch-active-workspace') activeWorkspace = randomUUID();
      if (url.searchParams.get('q') === 'release-first') {
        assert(firstStream);
        finish(firstStream, 'Hello 🦀', 'ready_for_review');
      }
      json(response, {
        conversations:
          conversation &&
          activeWorkspace === conversationContract.personalWorkspace &&
          (url.searchParams.get('archived') === 'only'
            ? conversation.archived
            : url.searchParams.get('archived') === 'exclude'
              ? !conversation.archived
              : true)
            ? [conversation]
            : [],
        hasMore: false,
        nextOffset: 0,
        nextCursor: null,
      });
      return;
    }
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
      assert(chunks.reduce((total, part) => total + part.length, 0) <= 100_000);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (
      request.method === 'PUT' &&
      conversation &&
      url.pathname === `/api/chat/conversations/${conversation.id}`
    ) {
      if (Object.hasOwn(body, 'draft')) {
        assert.deepEqual(Object.keys(body).sort(), ['draft', 'draftUpdatedAt']);
        assert.equal(
          request.headers[conversationContract.organizationHeader],
          conversationContract.personalWorkspace,
        );
        assert.equal(
          request.headers['if-match'],
          undefined,
          'Drafts have their own revision clock',
        );
        if (body.draft === 'Fixture missing draft revision') {
          json(response, { saved: true });
          return;
        }
        if (body.draft === 'Fixture invalid draft revision') {
          json(response, { saved: true, draftUpdatedAt: 'invalid' });
          return;
        }
        if (body.draft === 'Fixture null draft revision') {
          json(response, { saved: true, draftUpdatedAt: null });
          return;
        }
        const text = body.draft ?? '';
        if (
          conversation.draft !== text &&
          Date.parse(body.draftUpdatedAt) !== Date.parse(conversation.draft_updated_at) &&
          (body.draftUpdatedAt !== null || conversation.draft_updated_at !== null)
        ) {
          response.statusCode = 409;
          json(response, {
            saved: false,
            conflict: true,
            current: {
              draft: conversation.draft ?? '',
              draftUpdatedAt: conversation.draft_updated_at,
            },
          });
          return;
        }
        if ((conversation.draft ?? '') !== text) {
          conversation.draft = text || null;
          conversation.draft_updated_at = new Date(
            Math.max(Date.now(), Date.parse(conversation.draft_updated_at) + 1 || 0),
          ).toISOString();
          draftWrites += 1;
          if (text === 'Fixture draft response lost') {
            lostDraftResponses += 1;
            response.destroy();
            return;
          }
        }
        json(response, { saved: true, draftUpdatedAt: conversation.draft_updated_at });
        return;
      }
      if (body.title === 'Fixture response lost') lostResponseAttempts += 1;
      assert(
        request.headers[conversationContract.organizationHeader],
        'Metadata writes must pin a workspace',
      );
      if (
        request.headers[conversationContract.organizationHeader] !==
        conversationContract.personalWorkspace
      ) {
        response.statusCode = 403;
        json(response, { error: { message: 'Organization access denied' } });
        return;
      }
      if (request.headers['if-match'] !== `"${revision}"`) {
        response.statusCode = 412;
        response.setHeader('etag', `"${revision}"`);
        json(response, { error: { message: 'This conversation changed' }, current: conversation });
        return;
      }
      const keys = Object.keys(body);
      assert.equal(keys.length, 1, 'Metadata writes must contain only the intended field');
      assert(['title', 'model', 'pinned', 'archived'].includes(keys[0]));
      if (body.title === 'Fixture mismatched metadata') {
        response.setHeader('etag', `"${revision}"`);
        json(response, { conversation: { ...conversation, id: randomUUID() } });
        return;
      }
      if (body.model !== undefined) {
        assert.equal(body.model, 'fixture-selected-model');
        modelWrites += 1;
      }
      Object.assign(conversation, body);
      if (body.archived === true) conversation.pinned = false;
      revision += 1;
      metadataWrites += 1;
      response.setHeader('etag', `"${revision}"`);
      if (body.title === 'Fixture response lost') {
        response.destroy();
        return;
      }
      json(response, { conversation });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/chat/conversations') {
      conversation = {
        ...golden.read.conversation,
        id: body.id,
        model: 'fixture-chat-model',
        title: 'Native chat fixture',
        draft: null,
        draft_updated_at: null,
      };
      json(response, { conversation });
      return;
    }
    if (
      request.method === 'GET' &&
      conversation &&
      url.pathname === `/api/chat/conversations/${conversation.id}`
    ) {
      const selectedWorkspace =
        request.headers[conversationContract.organizationHeader] ?? activeWorkspace;
      if (selectedWorkspace !== conversationContract.personalWorkspace) {
        response.statusCode = 404;
        json(response, { error: { message: 'Conversation not found in this workspace' } });
        return;
      }
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 2);
      if (!omitRevision) response.setHeader('etag', `"${revision}"`);
      json(response, {
        conversation: {
          ...conversation,
          version: '"999"',
          ...(contextMode === 'foreign' ? { organization_id: randomUUID() } : {}),
        },
        messages: messages
          .slice(offset, offset + limit)
          .map((message, index) =>
            contextMode === 'oversized' && offset + index === 0
              ? { ...message, content: '\u0000'.repeat(600_000) }
              : message,
          ),
        hasMore: offset + limit < messages.length,
        total: messages.length,
      });
      return;
    }
    if (url.pathname.startsWith('/api/llm/v1/chat/completions/runs/')) {
      const run = runs.get(url.pathname.split('/').at(-1));
      assert(run);
      if (request.method === 'POST') {
        cancellations += 1;
        run.state = 'cancelled';
        messages.push({ ...golden.read.messages[0], id: run.assistantId, content: run.partial });
        run.response.end('data: [DONE]\n\n');
      }
      json(response, {
        run: {
          id: run.id,
          conversationId: run.mismatched ? 'different-conversation' : conversation.id,
          state: run.state,
          requestId: run.assistantId,
          originSurface: 'desktop',
          provider: 'fixture',
          model: conversation.model,
          updatedAt: '2026-11-09T00:00:00Z',
        },
      });
      return;
    }
    assert.equal(request.method, 'POST');
    assert.equal(url.pathname, '/api/llm/v1/chat/completions');
    assert.equal(request.headers['x-agi-surface'], 'desktop');
    assert.equal(request.headers['idempotency-key'], body.assistant_message_id);
    assert.equal(body.model, 'fixture-selected-model');
    posts += 1;
    assert(posts <= 3, 'A duplicate start issued a second model request');
    assert.equal(body.messages.length, posts === 1 ? 1 : posts === 2 ? 3 : 5);
    if (posts === 2) {
      assert.deepEqual(body.messages[0].content, [
        { type: 'text', text: 'First message' },
        { type: 'file', file: { asset_id: savedAttachment.assetId } },
      ]);
      assert.equal(body.messages[1].content, 'Hello 🦀');
    }
    messages.push({
      ...golden.read.messages[0],
      id: body.user_message.id,
      role: 'user',
      content: body.messages.at(-1).content,
      metadata: posts === 1 ? { attachments: [savedAttachment] } : {},
    });
    const run = {
      id: randomUUID(),
      state: 'running',
      response,
      assistantId: body.assistant_message_id,
      mismatched: posts === 3,
      partial: posts === 1 ? 'Hello 🦀' : 'Partial',
    };
    runs.set(run.id, run);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'X-AGI-Agent-Run-Id': run.id,
      'X-AGI-Tool-Loop': 'durable',
    });
    const text = posts === 1 ? 'Hello 🦀' : posts === 2 ? 'Partial' : 'Unbound';
    const frame = Buffer.from(
      `data: ${JSON.stringify({ choices: [{ delta: { ...(posts === 1 ? { content: text } : {}), x_agent_event: { schemaVersion: 5, sessionId: conversation.id, turnId: run.id, sequence: 0, emittedAtMs: 0, event: { type: 'text-delta', delta: text } } }, index: 0 }] })}\n\n`,
    );
    const split = posts === 1 ? frame.indexOf(Buffer.from('🦀')) + 2 : Math.floor(frame.length / 2);
    response.write(frame.subarray(0, split));
    response.write(frame.subarray(split));
    if (posts === 1) firstStream = { response, run, assistantId: body.assistant_message_id };
  } catch (error) {
    fixtureError = error;
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
    AGI_GPUI_CHAT_FIXTURE: '1',
    AGI_GPUI_TEST_RUNTIME: path.join(bundle, 'Contents/MacOS', manifest.executable),
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
      'real_cloud_chat_',
      '--',
      '--ignored',
    ],
    { cwd: root, env, stdio: 'inherit' },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (fixtureError) throw fixtureError;
  assert.equal(code, 0, 'The real-runtime chat fixture failed');
  assert.equal(posts, 3);
  assert.equal(lostResponseAttempts, 1, 'A lost mutation response was automatically replayed');
  assert.equal(
    metadataWrites,
    9,
    'Metadata recovery or a rejected write changed the record unexpectedly',
  );
  assert(
    catalogueReads >= 5,
    'The model list, validation failures and send-time admission must read the catalogue',
  );
  assert.equal(draftWrites, 5, 'Draft conflicts or retries unexpectedly mutated the saved draft');
  assert.equal(lostDraftResponses, 1, 'A lost draft response was replayed');
  assert.equal(modelWrites, 1, 'A rejected model choice mutated the conversation');
  assert.equal(cancellations, 1);
  process.stdout.write(
    'Real CLI model catalogue/admission/selection/replay, versioned metadata/workspace/recovery, and create/send/stream/persist/multi-turn/stop checks passed.\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(configRoot, { recursive: true, force: true });
}
