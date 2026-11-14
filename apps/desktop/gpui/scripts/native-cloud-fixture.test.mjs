import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import {
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  MANAGED_CLOUD_CHAT_BASE_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_WORKSPACES_PATH,
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  managedCloudResumableUploadPath,
  managedCloudResumableUploadPartsPath,
  managedCloudResumableUploadSessionPath,
  managedCloudProjectKnowledgePath,
  ManagedCloudProjectKnowledgeListResponseSchema,
} from '@agiworkforce/cloud-contracts';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { createNativeCloudFixture, fixtureModels } from './native-cloud-fixture.mjs';

const gateway = MANAGED_CLOUD_AGENT_RUNS_BASE_PATH.replace(/\/runs$/, '');
async function session(t) {
  const fixture = createNativeCloudFixture();
  const origin = await fixture.listen();
  t.after(() => fixture.close());
  const call = (route, options = {}) => {
    const headers = new globalThis.Headers({ authorization: `Bearer ${fixture.jwt}` });
    if (options.auth === false) headers.delete('authorization');
    if (options.workspace !== false)
      headers.set(
        MANAGED_CLOUD_ORGANIZATION_HEADER,
        options.workspace ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
    if (options.body) headers.set('Content-Type', 'application/json');
    for (const [key, value] of Object.entries(options.headers ?? {})) headers.set(key, value);
    return globalThis.fetch(`${origin}${route}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  };
  return { fixture, call };
}

test('native fixture proves account, membership and explicit content scope independently', async (t) => {
  const { fixture, call } = await session(t);
  assert.equal((await call(MANAGED_CLOUD_WORKSPACES_PATH, { auth: false })).status, 401);
  const listed = await (await call(MANAGED_CLOUD_WORKSPACES_PATH)).json();
  assert.equal(listed.accountId, fixture.owner);
  assert.equal(listed.workspaces.length, 3);
  const organization = listed.workspaces.find((row) => row.kind === 'organization');
  const selected = await call(MANAGED_CLOUD_WORKSPACES_PATH, {
    method: 'PUT',
    body: { workspaceId: organization.id },
  });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).activeOrganizationId, organization.organizationId);
  const personal = await (await call(MANAGED_CLOUD_CHAT_BASE_PATH)).json();
  assert.equal(personal.conversations.length, 2);
  const missing = await call(MANAGED_CLOUD_CHAT_BASE_PATH, { workspace: false });
  assert.equal(missing.status, 400);
  assert.equal(fixture.snapshot().scopes.at(-1).workspace, null);
  const foreign = await call(`${MANAGED_CLOUD_CHAT_BASE_PATH}/${personal.conversations[0].id}`, {
    workspace: organization.organizationId,
  });
  assert.equal(foreign.status, 404);
  assert.deepEqual(fixture.snapshot().failures, []);
});

test('native fixture preserves HTTP conflict status and performs one metadata write', async (t) => {
  const { fixture, call } = await session(t);
  const original = fixture.snapshot().conversations[0];
  const route = `${MANAGED_CLOUD_CHAT_BASE_PATH}/${original.conversation.id}`;
  const read = await call(route);
  const revision = read.headers.get('etag');
  assert.equal((await read.json()).messages.length, 6);
  assert.equal(
    (
      await call(route, {
        method: 'PUT',
        body: { title: 'Changed title' },
        headers: { 'If-Match': '"0"' },
      })
    ).status,
    412,
  );
  assert.equal(fixture.snapshot().conversations[0].conversation.title, original.conversation.title);
  const saved = await call(route, {
    method: 'PUT',
    body: { title: 'Changed title 東京' },
    headers: { 'If-Match': revision },
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).conversation.title, 'Changed title 東京');
  assert.equal(
    (
      await call(route, {
        method: 'PUT',
        body: { title: 'Stale title' },
        headers: { 'If-Match': revision },
      })
    ).status,
    412,
  );
  const current = fixture.snapshot().conversations[0];
  assert.equal(current.revision, original.revision + 1);
  assert.equal(current.messages.length, original.messages.length);
  assert.deepEqual(fixture.snapshot().failures, []);
});

test('native fixture draft clocks do not change metadata revisions or reorder history', async (t) => {
  const { fixture, call } = await session(t);
  const original = fixture.snapshot().conversations[0];
  const route = `${MANAGED_CLOUD_CHAT_BASE_PATH}/${original.conversation.id}`;
  const saved = await call(route, {
    method: 'PUT',
    body: { draft: 'Unsent 東京 🦀', draftUpdatedAt: null },
  });
  assert.equal(saved.status, 200);
  const acknowledgement = await saved.json();
  assert.equal(acknowledgement.saved, true);
  assert(Number.isFinite(Date.parse(acknowledgement.draftUpdatedAt)));
  const read = await call(route);
  const body = await read.json();
  assert.equal(body.conversation.draft, 'Unsent 東京 🦀');
  assert.equal(body.conversation.updated_at, original.conversation.updated_at);
  assert.equal(read.headers.get('etag'), `"${original.revision}"`);
  const conflict = await call(route, {
    method: 'PUT',
    body: { draft: 'Stale replacement', draftUpdatedAt: null },
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual((await conflict.json()).current, {
    draft: 'Unsent 東京 🦀',
    draftUpdatedAt: acknowledgement.draftUpdatedAt,
  });
  const retry = await call(route, {
    method: 'PUT',
    body: { draft: 'Unsent 東京 🦀', draftUpdatedAt: null },
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).draftUpdatedAt, acknowledgement.draftUpdatedAt);
  assert.equal(fixture.snapshot().conversations[0].revision, original.revision);
  assert.deepEqual(fixture.snapshot().failures, []);
});

test('native fixture streaming retains history, selected model and idempotency', async (t) => {
  const { fixture, call } = await session(t);
  const row = fixture.snapshot().conversations[0];
  const requestId = randomUUID();
  const body = {
    conversation_id: row.conversation.id,
    assistant_message_id: requestId,
    user_message: { id: randomUUID() },
    model: fixtureModels.at(-1).id,
    messages: [
      ...row.messages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: 'Native fixture message' },
    ],
  };
  body.messages[0].content = [
    { type: 'text', text: row.messages[0].content },
    { type: 'file', file: { asset_id: '77777777-7777-4777-8777-777777777777' } },
  ];
  const options = {
    method: 'POST',
    body,
    headers: { 'X-AGI-Surface': 'desktop', 'Idempotency-Key': requestId },
  };
  const stream = await call(gateway, options);
  assert.equal(stream.status, 200);
  const runId = stream.headers.get('x-agi-agent-run-id');
  assert.match(await stream.text(), /Fixture reply 1/);
  assert.equal((await call(gateway, options)).status, 409);
  const snapshot = fixture.snapshot();
  assert.equal(snapshot.requests.length, 1);
  assert.equal(snapshot.conversations[0].messages.length, row.messages.length + 2);
  assert.equal(snapshot.conversations[0].messages.at(-1).model, fixtureModels.at(-1).id);
  const journal = await (
    await call(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${runId}?after=-1&limit=50`)
  ).json();
  assert.equal(journal.run.state, 'ready_for_review');
  assert.equal(journal.run.model, fixtureModels.at(-1).id);
  assert.equal(journal.events[0].sequence, 0);
  assert.deepEqual(snapshot.failures, []);
});

test('native fixture reviews two complete actions and records denial without tools', async (t) => {
  const { fixture, call } = await session(t);
  const pending = fixture.snapshot().runs[0];
  assert.equal(pending.pendingApproval.toolCalls.length, 2);
  const route = `${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${pending.id}`;
  const before = await (await call(`${route}?after=-1&limit=50`)).json();
  const actions = before.events.filter((entry) => entry.event.type === 'approval-requested');
  assert.equal(actions.length, 2);
  assert(
    actions.every((entry) => entry.event.input.content.startsWith('Synthetic reviewed content')),
  );
  const body = {
    run_id: pending.id,
    detached: true,
    tool_approvals: pending.pendingApproval.toolCalls.map((entry) => ({
      tool_call_id: entry.toolCallId,
      decision: 'rejected',
    })),
  };
  const response = await call(`${gateway}/approve`, {
    method: 'POST',
    body,
    headers: { 'X-AGI-Surface': 'desktop' },
  });
  assert.equal(response.status, 200);
  await response.text();
  const after = await (await call(`${route}?after=-1&limit=50`)).json();
  assert.equal(after.run.state, 'ready_for_review');
  assert.equal(after.run.pendingApproval, undefined);
  assert.deepEqual(
    after.events
      .filter((entry) => entry.event.type === 'approval-resolved')
      .map((entry) => entry.event.decision),
    ['denied', 'denied'],
  );
  assert.deepEqual(fixture.snapshot().failures, []);
});

test(
  'native fixture holds an accepted stream until explicit cancellation',
  { timeout: 5_000 },
  async (t) => {
    const { fixture, call } = await session(t);
    const created = await call(MANAGED_CLOUD_CHAT_BASE_PATH, {
      method: 'POST',
      body: { id: randomUUID() },
    });
    const row = (await created.json()).conversation;
    assert.equal(
      (await call('/fixture/control', { method: 'POST', body: { nextStream: 'hold' } })).status,
      200,
    );
    const requestId = randomUUID();
    const stream = await call(gateway, {
      method: 'POST',
      headers: { 'X-AGI-Surface': 'desktop', 'Idempotency-Key': requestId },
      body: {
        conversation_id: row.id,
        assistant_message_id: requestId,
        user_message: { id: randomUUID() },
        model: fixtureModels[0].id,
        messages: [{ role: 'user', content: 'A controlled streaming fixture turn' }],
      },
    });
    assert.equal(stream.status, 200);
    const received = stream.text();
    const id = stream.headers.get('x-agi-agent-run-id');
    assert.equal(fixture.snapshot().runs.find((run) => run.id === id).state, 'running');
    const stopped = await call(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/${id}`, {
      method: 'POST',
      body: {},
    });
    assert.equal(stopped.status, 200);
    assert.equal((await stopped.json()).run.state, 'cancelled');
    assert.match(await received, /\[DONE\]/);
    const saved = fixture
      .snapshot()
      .conversations.find((entry) => entry.conversation.id === row.id);
    assert.equal(saved.messages.length, 2);
    assert.equal(saved.messages.at(-1).id, requestId);
    assert.deepEqual(fixture.snapshot().failures, []);
  },
);

test('native project file fixture actually supplies each refusal and source-change condition', async (t) => {
  const { fixture, call } = await session(t);
  const project = fixture
    .snapshot()
    .projects.find((row) => row.organizationId === null && !row.isArchived);
  const route = managedCloudProjectKnowledgePath(project.id);
  const read = async () => (await call(route)).json();
  const normal = ManagedCloudProjectKnowledgeListResponseSchema.parse(await read());
  assert.equal(normal.files.length, 3);
  const source = normal.files.find((file) => file.textPreviewKind === 'text');
  const previewPath = `${route}/${source.id}/text`;
  const preview = await (await call(previewPath)).json();
  assert(preview.text.includes('東京 🦀'));
  assert.equal(preview.kind, 'text');
  assert.equal((await call(route, { workspace: randomUUID() })).status, 403);
  const mode = async (projectFileMode) => {
    assert.equal(
      (await call('/fixture/control', { method: 'POST', body: { projectFileMode } })).status,
      200,
    );
  };
  await mode('duplicate');
  const duplicated = await read();
  assert.equal(new Set(duplicated.files.map((file) => file.id)).size, duplicated.files.length - 1);
  await mode('wrong-project');
  assert.notEqual((await read()).files[0].projectId, project.id);
  await mode('unsafe-byte-count');
  const unsafe = await read();
  assert.equal(unsafe.files[0].byteCount, Number.MAX_SAFE_INTEGER + 1);
  assert.equal(ManagedCloudProjectKnowledgeListResponseSchema.safeParse(unsafe).success, false);
  await mode('oversize-preview');
  assert.equal((await (await call(previewPath)).json()).text.length, MAX_FILE_TEXT_CHARS + 1);
  await mode('changed-preview');
  assert.equal((await call(previewPath)).status, 200);
  assert.notEqual(
    (await read()).files.find((file) => file.id === source.id).checksumSha256,
    source.checksumSha256,
  );
  const shared = fixture.snapshot().projects.find((row) => row.sharedAccess === 'read');
  const options = { workspace: shared.organizationId };
  assert.equal((await call(managedCloudProjectKnowledgePath(shared.id), options)).status, 200);
  assert.equal(
    (
      await call('/fixture/control', {
        method: 'POST',
        body: { projectAccess: { id: shared.id, access: null } },
      })
    ).status,
    200,
  );
  assert.equal((await call(managedCloudProjectKnowledgePath(shared.id), options)).status, 403);
  assert.deepEqual(fixture.snapshot().failures, []);
});

test('native upload fixture uses its real origin, stores exact part bytes and completes idempotently', async (t) => {
  const { fixture, call } = await session(t);
  const project = fixture
    .snapshot()
    .projects.find((row) => row.organizationId === null && !row.isArchived);
  const bytes = Buffer.from('exact selected bytes 東京 🦀');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const created = await call(MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH, {
    method: 'POST',
    body: {
      kind: 'knowledge-file',
      projectId: project.id,
      fileName: 'upload.txt',
      mimeType: 'text/plain',
      byteCount: bytes.length,
      checksumSha256: checksum,
      sourceSurface: 'desktop',
    },
  });
  assert.equal(created.status, 200);
  const upload = await created.json();
  const signed = await (
    await call(managedCloudResumableUploadPartsPath(upload.uploadId), {
      method: 'POST',
      body: { session: upload.session, partNumbers: [1] },
    })
  ).json();
  assert.equal(new URL(signed.parts[0].url).port, String(fixture.server.address().port));
  const put = await globalThis.fetch(signed.parts[0].url, {
    method: 'PUT',
    headers: {
      ...signed.parts[0].headers,
      Authorization: `Bearer ${fixture.jwt}`,
      [MANAGED_CLOUD_ORGANIZATION_HEADER]: MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    },
    body: bytes,
  });
  assert.equal(put.status, 200);
  const progress = await (
    await call(managedCloudResumableUploadSessionPath(upload.uploadId, upload.session))
  ).json();
  assert.equal(progress.bytesStored, bytes.length);
  const complete = () =>
    call(managedCloudResumableUploadPath(upload.uploadId), {
      method: 'POST',
      body: { session: upload.session },
    });
  const first = await (await complete()).json();
  const second = await (await complete()).json();
  assert.equal(first.file.checksumSha256, checksum);
  assert.equal(second.file.id, first.file.id);
  assert.equal(fixture.snapshot().counts.uploadCompletedFiles, 1);
  assert.equal(fixture.snapshot().counts.uploadPartWrites, 1);
  assert.deepEqual(fixture.snapshot().failures, []);
});

test('native file fixture serves its declared bytes and rejects reader reindex writes', async (t) => {
  const { fixture, call } = await session(t);
  const project = fixture
    .snapshot()
    .projects.find((row) => row.organizationId === null && !row.isArchived);
  const route = managedCloudProjectKnowledgePath(project.id);
  const listed = await (await call(route)).json();
  const source = listed.files[0];
  const bytes = Buffer.from(await (await call(`${route}/${source.id}`)).arrayBuffer());
  assert.equal(bytes.length, source.byteCount);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.checksumSha256);
  assert.equal(
    (await call('/fixture/control', { method: 'POST', body: { downloadMode: 'bad-bytes' } }))
      .status,
    200,
  );
  const bad = Buffer.from(await (await call(`${route}/${source.id}`)).arrayBuffer());
  assert.notEqual(createHash('sha256').update(bad).digest('hex'), source.checksumSha256);
  const shared = fixture.snapshot().projects.find((row) => row.sharedAccess === 'read');
  const sharedRoute = managedCloudProjectKnowledgePath(shared.id);
  const sharedFiles = await (await call(sharedRoute, { workspace: shared.organizationId })).json();
  assert.equal(
    (
      await call(`${sharedRoute}/${sharedFiles.files[0].id}/reindex`, {
        method: 'POST',
        workspace: shared.organizationId,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(fixture.snapshot().counts.reindexWrites, undefined);
  const queued = await call(`${route}/${source.id}/reindex`, { method: 'POST', body: {} });
  assert.equal(queued.status, 202);
  assert.equal((await queued.json()).indexing.status, 'pending');
  assert.deepEqual(fixture.snapshot().failures, []);
});
