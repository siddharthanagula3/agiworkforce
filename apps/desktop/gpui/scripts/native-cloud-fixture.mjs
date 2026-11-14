import assert from 'node:assert/strict';
import { createProjectUploadFixture } from './project-upload-fixture.mjs';
import { createProjectFileFixture } from './project-file-fixture.mjs';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, URL } from 'node:url';

import {
  MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH,
  RESUMABLE_UPLOAD_PART_BYTES,
  AgentEventEnvelopeSchema,
  CloudAgentRunListPageSchema,
  CloudAgentRunSchema,
  CloudAgentRunSnapshotPageSchema,
  MANAGED_CLOUD_AGENT_RUNS_BASE_PATH,
  MANAGED_CLOUD_CHAT_BASE_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_WORKSPACES_PATH,
  ManagedCloudAccountWorkspacesSchema,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudConversationWireSchema,
  MANAGED_CLOUD_PROJECTS_PATH,
  MANAGED_CLOUD_PROJECT_DEFAULT_PAGE_SIZE,
  ManagedCloudProjectSchema,
  managedCloudProjectKnowledgePath,
  ManagedCloudProjectKnowledgeFileSchema,
  ManagedCloudProjectCreateRequestSchema,
  ManagedCloudProjectUpdateRequestSchema,
  ManagedCloudCreateConversationRequestSchema,
  ManagedCloudMessageWireSchema,
  ManagedCloudUpdateConversationRequestSchema,
} from '@agiworkforce/cloud-contracts';
import {
  MAX_FILE_TEXT_CHARS,
  AGENT_EVENT_SCHEMA_VERSION,
  AGI_WORK_MODE,
  PERSONAL_WORKSPACE_SELECTOR,
  SYNCED_APP_SURFACES,
} from '@agiworkforce/types';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const golden = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      'packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json',
    ),
    'utf8',
  ),
);
const goldenMe = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/contracts/cloud-contracts/src/__fixtures__/me-response.golden.json'),
    'utf8',
  ),
);
const gatewayPath = path.posix.dirname(MANAGED_CLOUD_AGENT_RUNS_BASE_PATH);

export const fixtureModels = [
  {
    id: 'fixture-selected-model',
    displayName: 'Fixture available model',
    developerLabel: 'Local test server',
    admitted: true,
    temporarilyUnavailable: false,
    minimumPlanLabel: null,
  },
  {
    id: 'fixture-blocked-model',
    displayName: 'Fixture restricted model',
    developerLabel: 'Local test server',
    admitted: false,
    temporarilyUnavailable: false,
    minimumPlanLabel: 'Fixture restricted plan',
  },
  {
    id: 'fixture-degraded-model',
    displayName: 'Fixture unavailable model',
    developerLabel: 'Local test server',
    admitted: true,
    temporarilyUnavailable: true,
    minimumPlanLabel: null,
  },
  {
    id: 'fixture-alternate-model',
    displayName: 'Fixture alternate model',
    developerLabel: 'Local test server',
    admitted: true,
    temporarilyUnavailable: false,
    minimumPlanLabel: null,
  },
];

export function createNativeCloudFixture() {
  const owner = randomUUID();
  const jwt = `fixture.${Buffer.from(JSON.stringify({ sub: owner, sid: randomUUID() })).toString('base64url')}.signature`;
  const personal = MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;
  const workspaces = [
    {
      id: randomUUID(),
      kind: 'personal',
      organizationId: null,
      name: 'Fixture personal workspace',
      slug: 'fixture-personal',
      role: null,
      isPrimary: true,
    },
    ...['fixture-team-a', 'fixture-team-b'].map((slug) => ({
      id: randomUUID(),
      kind: 'organization',
      organizationId: randomUUID(),
      name: 'Fixture team',
      slug,
      role: 'member',
      isPrimary: true,
    })),
  ];
  const conversations = new Map();
  const projects = new Map();
  const projectFiles = new Map();
  let projectFileMode = 'normal';
  let repeatProjectCursor = false;
  const runs = new Map();
  const requests = new Map();
  const failures = [];
  const scopes = [];
  const counts = {};
  let active = personal;
  let catalogue = 'valid';
  let nextStream = 'complete';
  let clock = Date.now();
  const stamp = () => new Date(clock++).toISOString();

  function project(name, workspace = personal, overrides = {}) {
    const value = ManagedCloudProjectSchema.parse({
      id: randomUUID(),
      ownerUserId: owner,
      organizationId: workspace === personal ? null : workspace,
      name,
      description: 'Synthetic native project',
      instructions: 'Keep this project context separate.',
      serverVersion: '1',
      isArchived: false,
      isOrgShared: false,
      sharedAccess: null,
      defaultPrivacyMode: 'managed',
      defaultProviderMode: 'ManagedGateway',
      allowedSurfaces: [...SYNCED_APP_SURFACES],
      defaultModelId: fixtureModels[0].id,
      chatDefaults: {},
      conversationCount: 0,
      knowledgeFileCount: 0,
      createdAt: stamp(),
      updatedAt: stamp(),
      ...overrides,
    });
    const files = [
      ['notes 東京.md', 'text/markdown', 'text', '# Synthetic project notes\n\nUnicode 東京 🦀'],
      ['data.csv', 'text/csv', 'table', 'name,value\n東京,2'],
      ['scan.pdf', 'application/pdf', null, '%PDF-synthetic'],
    ].map(([fileName, mimeType, textPreviewKind, text]) => ({
      ...ManagedCloudProjectKnowledgeFileSchema.parse({
        id: randomUUID(),
        projectId: value.id,
        fileName,
        mimeType,
        byteCount: Buffer.byteLength(text),
        checksumSha256: createHash('sha256').update(text).digest('hex'),
        sourceSurface: 'web',
        addedByUserId: owner,
        addedAt: stamp(),
        storageUri: '/not-a-native-download-url',
        textPreviewKind,
        indexing: {
          status: 'indexed',
          chunkCount: 1,
          semantic: false,
          attempts: 1,
          error: null,
          indexedAt: stamp(),
        },
      }),
      text,
    }));
    projectFiles.set(value.id, files);
    value.knowledgeFileCount = files.length;
    projects.set(value.id, value);
    return value;
  }
  project('Fixture project 東京');
  project('Fixture archived project', personal, { isArchived: true });
  project('Fixture third project');
  project('Fixture web-only project', personal, { allowedSurfaces: ['web'] });
  project('Fixture shared read project', workspaces[1].organizationId, {
    ownerUserId: randomUUID(),
    isOrgShared: true,
    sharedAccess: 'read',
  });
  project('Fixture shared write project', workspaces[1].organizationId, {
    ownerUserId: randomUUID(),
    isOrgShared: true,
    sharedAccess: 'write',
  });

  function conversation(title, workspace = personal, mode = 'chat', id = randomUUID()) {
    const value = ManagedCloudConversationWireSchema.parse({
      ...golden.read.conversation,
      id,
      title,
      model: fixtureModels[0].id,
      organization_id: workspace === personal ? null : workspace,
      pinned: false,
      archived: false,
      draft: null,
      draft_updated_at: null,
      work_mode: mode,
      created_at: stamp(),
      updated_at: stamp(),
    });
    const row = { workspace, conversation: value, messages: [], revision: 1 };
    conversations.set(id, row);
    return row;
  }
  function message(row, role, content, id = randomUUID(), metadata = null) {
    const value = ManagedCloudMessageWireSchema.parse({
      ...golden.read.messages[0],
      id,
      role,
      content,
      model: row.conversation.model,
      provider: 'fixture',
      metadata,
      created_at: stamp(),
    });
    row.messages.push(value);
    row.conversation.updated_at = stamp();
    row.revision += 1;
    return value;
  }
  function append(run, event) {
    const value = AgentEventEnvelopeSchema.parse({
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      sessionId: run.conversationId ?? run.id,
      turnId: run.id,
      sequence: run.events.length,
      emittedAtMs: 0,
      event,
    });
    run.events.push(value);
    run.updatedAt = stamp();
    return value;
  }
  function runFor(row, title, state, requestId = randomUUID()) {
    const run = {
      id: randomUUID(),
      userId: owner,
      requestId,
      conversationId: row?.conversation.id ?? null,
      conversationTitle: title,
      conversationPreview: 'Synthetic native Cloud verification',
      state,
      workState: state === 'awaiting_input' ? 'awaiting_approval' : state,
      workMode: row?.conversation.work_mode ?? AGI_WORK_MODE,
      originSurface: 'desktop',
      provider: 'fixture',
      model: fixtureModels[0].id,
      lastEventSequence: -1,
      cancellationRequestedAt: null,
      completedAt: null,
      createdAt: stamp(),
      updatedAt: stamp(),
      workspace: row?.workspace ?? personal,
      events: [],
      approvals: [],
    };
    runs.set(run.id, run);
    return run;
  }
  function wire(run) {
    return CloudAgentRunSchema.parse({ ...run, lastEventSequence: run.events.length - 1 });
  }
  function addApprovals(run) {
    run.approvals = [1, 2].map((index) => ({
      type: 'approval-requested',
      approvalId: randomUUID(),
      toolCallId: randomUUID(),
      name: `fixture.action_${index}`,
      category: 'other',
      summary: `Fixture action ${index}: review synthetic report content`,
      input: {
        path: `fixture-report-${index}.txt`,
        content: `Synthetic reviewed content ${index}`,
      },
      riskLevel: 'high',
    }));
    for (const action of run.approvals) append(run, action);
    run.pendingApproval = {
      requestedAt: stamp(),
      toolCalls: run.approvals.map((action) => ({
        toolCallId: action.toolCallId,
        name: action.name,
        argsPreview: 'Synthetic preview; full input is in the journal',
      })),
    };
    run.state = 'awaiting_input';
    run.workState = 'awaiting_approval';
  }
  const history = conversation('Fixture history with multiple messages');
  for (const [role, text] of [
    ['user', 'Show a short Markdown example.'],
    [
      'assistant',
      '## Fixture summary\n\nA saved reply with **bold text** and `inline code`.\n\n```rust\nlet verified = true;\n```',
    ],
    ['user', 'Keep the next reply in this conversation.'],
    [
      'assistant',
      'Second saved reply: 東京 🦀\n\n| Item | State |\n| --- | --- |\n| History | Retained |',
    ],
    ['user', 'What is this conversation for?'],
    ['assistant', 'This conversation belongs only to the isolated native UI fixture.'],
  ])
    message(history, role, text);
  history.messages[0].metadata = {
    attachments: [
      {
        id: 'fixture-saved-file',
        assetId: '77777777-7777-4777-8777-777777777777',
        type: 'file',
        name: 'Saved report 東京 🦀.pdf',
        size: 1024,
        mimeType: 'application/pdf',
      },
    ],
  };
  const organization = conversation('Fixture organization history', workspaces[1].organizationId);
  message(organization, 'user', 'Keep this in the selected organization.');
  message(organization, 'assistant', 'This synthetic reply is scoped to fixture-team-a.');
  const review = conversation('Fixture work review history', personal, AGI_WORK_MODE);
  message(review, 'user', 'Review two synthetic actions.');
  message(review, 'assistant', 'Both proposed actions require explicit review.');
  for (const title of ['Fixture actions to approve', 'Fixture actions to deny']) {
    const run = runFor(review, title, 'awaiting_input');
    run.originSurface = 'web';
    append(run, { type: 'text-delta', delta: 'Review the complete synthetic actions.' });
    addApprovals(run);
  }
  const paused = runFor(review, 'Fixture paused work', 'paused');
  paused.originSurface = 'web';
  append(paused, { type: 'text-delta', delta: 'Synthetic work paused before continuation.' });

  const projectUploads = createProjectUploadFixture({
    projects,
    projectFiles,
    conversations,
    owner,
    personal,
    counts,
    json,
    error,
    stamp,
  });
  const fileActions = createProjectFileFixture({ owner, counts, json, error, stamp });
  function snapshot() {
    return globalThis.structuredClone({
      owner,
      active,
      workspaces,
      catalogue,
      nextStream,
      failures,
      counts,
      scopes,
      projects: [...projects.values()],
      uploads: projectUploads.snapshot(),
      downloads: fileActions.snapshot(),
      conversations: [...conversations.values()],
      runs: [...runs.values()].map((run) => ({ ...wire(run), workspace: run.workspace })),
      requests: [...requests.keys()],
    });
  }
  function json(response, body, status = response.statusCode) {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
  }
  function error(response, status, text) {
    json(response, { error: { message: text } }, status);
  }
  function streamFrame(response, delta) {
    response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\n`);
  }
  function streamStart(response, run, transport = 'durable') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'X-AGI-Agent-Run-Id': run.id,
      'X-AGI-Tool-Loop': 'durable',
      'X-AGI-Agent-Transport': transport,
    });
  }
  function complete(run, text, state = 'ready_for_review') {
    const row = conversations.get(run.conversationId);
    if (row && !row.messages.some((entry) => entry.id === run.requestId))
      message(row, 'assistant', text, run.requestId).model = run.model;
    run.state = state;
    run.workState = state;
    run.completedAt = stamp();
    run.updatedAt = stamp();
    if (state === 'cancelled') {
      delete run.pendingApproval;
      run.approvals = [];
    }
    if (run.response && !run.response.writableEnded && !run.response.destroyed)
      run.response.end('data: [DONE]\n\n');
    run.response = null;
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== `Bearer ${jwt}`)
        return error(response, 401, 'This local fixture requires its synthetic credential');
      const url = new URL(request.url, `http://127.0.0.1:${request.socket.localPort}`);
      const route = `${request.method} ${url.pathname}`;
      if (request.method === 'POST' && url.pathname === gatewayPath)
        counts.gatewayCalls = (counts.gatewayCalls ?? 0) + 1;
      if (!url.pathname.startsWith('/fixture/')) counts[route] = (counts[route] ?? 0) + 1;
      const filePart =
        request.method === 'PUT' &&
        url.pathname.startsWith(`${MANAGED_CLOUD_RESUMABLE_UPLOADS_PATH}/`);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > (filePart ? RESUMABLE_UPLOAD_PART_BYTES : 1_000_000))
          return error(response, 413, 'Fixture request exceeds its test budget');
        chunks.push(chunk);
      }
      const body = filePart
        ? Buffer.concat(chunks)
        : chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
          : {};
      if (url.pathname === '/fixture/state' && request.method === 'GET')
        return json(response, snapshot());
      if (url.pathname === '/fixture/control' && request.method === 'POST') {
        for (const key of Object.keys(body))
          assert(
            [
              'nextStream',
              'catalogue',
              'bumpRevision',
              'projectCursor',
              'projectFileMode',
              'uploadMode',
              'downloadMode',
              'reindexMode',
              'projectChange',
              'projectAccess',
              'temporaryChange',
              'conversationAccess',
            ].includes(key),
          );
        if (body.nextStream) {
          assert(['complete', 'hold', 'approvals', 'lost-accept'].includes(body.nextStream));
          nextStream = body.nextStream;
        }
        if (body.catalogue) {
          assert(['valid', 'malformed', 'error'].includes(body.catalogue));
          catalogue = body.catalogue;
        }
        if (body.downloadMode) fileActions.setDownloadMode(body.downloadMode);
        if (body.reindexMode) fileActions.setReindexMode(body.reindexMode);
        if (body.uploadMode) projectUploads.setMode(body.uploadMode);
        if (body.projectFileMode) {
          assert(
            [
              'normal',
              'duplicate',
              'changed-preview',
              'oversize-preview',
              'wrong-project',
              'unsafe-byte-count',
            ].includes(body.projectFileMode),
          );
          projectFileMode = body.projectFileMode;
        }
        if (body.projectCursor) {
          assert(['normal', 'repeat'].includes(body.projectCursor));
          repeatProjectCursor = body.projectCursor === 'repeat';
        }
        if (body.projectAccess) {
          const row = projects.get(body.projectAccess.id);
          assert(row && row.isOrgShared);
          assert(['read', 'write', null].includes(body.projectAccess.access));
          row.sharedAccess = body.projectAccess.access;
        }
        if (body.projectChange) {
          const row = projects.get(body.projectChange.id);
          assert(row);
          const change = ManagedCloudProjectUpdateRequestSchema.parse(body.projectChange.change);
          Object.assign(row, change);
          row.serverVersion = String(BigInt(row.serverVersion) + 1n);
        }
        if (body.temporaryChange) {
          const row = conversations.get(body.temporaryChange.id);
          assert(row && typeof body.temporaryChange.temporary === 'boolean');
          row.conversation.is_temporary = body.temporaryChange.temporary;
          row.revision += 1;
        }
        if (body.conversationAccess) {
          const row = conversations.get(body.conversationAccess.id);
          assert(row && typeof body.conversationAccess.available === 'boolean');
          row.unavailable = !body.conversationAccess.available;
        }
        if (body.bumpRevision) {
          const row = conversations.get(body.bumpRevision);
          assert(row);
          row.revision += 1;
        }
        return json(response, snapshot());
      }
      if (url.pathname === '/api/me' && request.method === 'GET')
        return json(response, {
          ...goldenMe,
          id: owner,
          email: 'native-cloud-fixture@example.invalid',
          name: 'Native Cloud fixture',
          capability_handshake: {
            ...goldenMe.capability_handshake,
            sessionId: owner,
            computedAt: stamp(),
          },
        });
      if (url.pathname === '/api/usage' && request.method === 'GET')
        return json(response, {
          plan_tier: goldenMe.plan.tier,
          usage_percentage: 0,
          has_usage_remaining: true,
          credits: null,
        });
      if (url.pathname === '/api/models/catalogue' && request.method === 'GET') {
        if (catalogue === 'error') return error(response, 503, 'Synthetic catalogue outage');
        const models = globalThis.structuredClone(fixtureModels);
        if (catalogue === 'malformed') models.push(models[0]);
        return json(response, {
          models,
          count: models.length,
          planLabel: `Fixture ${goldenMe.plan.display_name}`,
        });
      }
      if (url.pathname === MANAGED_CLOUD_WORKSPACES_PATH) {
        if (request.method === 'GET') {
          const selected = workspaces.find((workspace) => workspace.organizationId === active);
          return json(
            response,
            ManagedCloudAccountWorkspacesSchema.parse({
              accountId: owner,
              workspaces,
              activeWorkspaceId: active === personal ? null : selected?.id,
              activeOrganizationId: active === personal ? null : active,
              scope: active === personal ? 'personal' : 'organization',
            }),
          );
        }
        assert.equal(request.method, 'PUT');
        const selected = workspaces.find((workspace) => workspace.id === body.workspaceId);
        if (body.workspaceId !== PERSONAL_WORKSPACE_SELECTOR && !selected)
          return error(response, 403, 'Fixture membership is unavailable');
        active =
          body.workspaceId === PERSONAL_WORKSPACE_SELECTOR
            ? personal
            : (selected.organizationId ?? personal);
        return json(response, {
          workspaceId: body.workspaceId === PERSONAL_WORKSPACE_SELECTOR ? null : selected.id,
          activeOrganizationId: active === personal ? null : active,
          scope: active === personal ? 'personal' : 'organization',
        });
      }
      const workspace = request.headers[MANAGED_CLOUD_ORGANIZATION_HEADER];
      scopes.push({ route, workspace: workspace ?? null });
      if (scopes.length > 64) scopes.shift();
      if (!workspace)
        return error(response, 400, 'Native content requests must explicitly pin their workspace');
      if (workspace !== personal && !workspaces.some((entry) => entry.organizationId === workspace))
        return error(response, 403, 'Fixture workspace is unavailable');
      if (await projectUploads.handle(request, response, url, body, workspace)) return;
      if (url.pathname === MANAGED_CLOUD_PROJECTS_PATH) {
        if (request.method === 'GET') {
          const rows = [...projects.values()].filter(
            (row) => (row.organizationId ?? personal) === workspace,
          );
          const offset = Number(url.searchParams.get('cursor')?.replace('project-page-', '') ?? 0);
          const limit = Number(
            url.searchParams.get('limit') ?? MANAGED_CLOUD_PROJECT_DEFAULT_PAGE_SIZE,
          );
          const page = rows.slice(offset, offset + limit);
          const hasMore = offset + page.length < rows.length;
          return json(response, {
            projects: page,
            hasMore,
            nextCursor: hasMore
              ? repeatProjectCursor && offset > 0
                ? url.searchParams.get('cursor')
                : `project-page-${offset + page.length}`
              : null,
          });
        }
        assert.equal(request.method, 'POST');
        const input = ManagedCloudProjectCreateRequestSchema.parse(body);
        const row = project(input.name, workspace, {
          description: input.description?.trim() ?? '',
          instructions: input.instructions?.trim() ?? '',
        });
        counts.projectWrites = (counts.projectWrites ?? 0) + 1;
        if (input.name === 'Fixture lost project creation') {
          response.destroy();
          return;
        }
        return json(response, { project: row }, 201);
      }
      const fileProject = [...projects.values()].find(
        (row) =>
          url.pathname === managedCloudProjectKnowledgePath(row.id) ||
          url.pathname.startsWith(`${managedCloudProjectKnowledgePath(row.id)}/`),
      );
      if (fileProject) {
        if ((fileProject.organizationId ?? personal) !== workspace)
          return error(response, 404, 'Project files not found in this workspace');
        if (fileProject.ownerUserId !== owner && !fileProject.sharedAccess)
          return error(response, 403, 'Project file access revoked');
        const base = managedCloudProjectKnowledgePath(fileProject.id);
        const files = projectFiles.get(fileProject.id);
        if (fileActions.handle(request, response, url, fileProject, files, base, workspace)) return;
        assert.equal(request.method, 'GET');
        if (url.pathname === base) {
          const rows = files.map(({ text: _text, ...metadata }) => metadata);
          if (projectFileMode === 'duplicate') rows.push(rows[0]);
          if (projectFileMode === 'wrong-project')
            rows[0] = { ...rows[0], projectId: randomUUID() };
          if (projectFileMode === 'unsafe-byte-count')
            rows[0] = { ...rows[0], byteCount: Number.MAX_SAFE_INTEGER + 1 };
          return json(response, { files: rows });
        }
        const file = files.find((entry) => url.pathname === `${base}/${entry.id}/text`);
        if (!file || !file.textPreviewKind)
          return error(response, 404, 'This file has no text preview');
        const text =
          projectFileMode === 'oversize-preview' ? 'x'.repeat(MAX_FILE_TEXT_CHARS + 1) : file.text;
        if (projectFileMode === 'changed-preview') {
          file.checksumSha256 = createHash('sha256').update('replacement').digest('hex');
          projectFileMode = 'normal';
        }
        return json(response, { kind: file.textPreviewKind, text, truncated: false });
      }
      if (url.pathname.startsWith(`${MANAGED_CLOUD_PROJECTS_PATH}/`)) {
        const id = url.pathname.slice(MANAGED_CLOUD_PROJECTS_PATH.length + 1);
        const row = projects.get(id);
        if (!row || (row.organizationId ?? personal) !== workspace)
          return error(response, 404, 'Project not found in this workspace');
        response.setHeader('etag', `"${row.serverVersion}"`);
        if (request.method === 'GET') return json(response, { project: row });
        assert.equal(request.method, 'PUT');
        if (row.ownerUserId !== owner && row.sharedAccess !== 'write')
          return error(response, 403, 'This project is read-only');
        if (row.ownerUserId !== owner && Object.hasOwn(body, 'isArchived'))
          return error(response, 403, 'Only the owner can archive this project');
        if (request.headers['if-match'] !== `"${row.serverVersion}"`)
          return json(response, { error: { message: 'This project changed' }, current: row }, 412);
        const input = ManagedCloudProjectUpdateRequestSchema.parse(body);
        assert(
          Object.keys(input).every((key) =>
            ['name', 'description', 'instructions', 'isArchived'].includes(key),
          ),
        );
        if (input.name === 'Fixture nonadvancing project reply')
          return json(response, { project: { ...row, ...input } });
        Object.assign(row, input);
        for (const key of ['description', 'instructions'])
          if (Object.hasOwn(input, key) && typeof row[key] === 'string') row[key] = row[key].trim();
        row.serverVersion = String(BigInt(row.serverVersion) + 1n);
        row.updatedAt = stamp();
        counts.projectWrites = (counts.projectWrites ?? 0) + 1;
        response.setHeader('etag', `"${row.serverVersion}"`);
        if (input.name === 'Fixture lost project reply') {
          response.destroy();
          return;
        }
        return json(response, { project: ManagedCloudProjectSchema.parse(row) });
      }
      if (url.pathname === MANAGED_CLOUD_CHAT_BASE_PATH) {
        if (request.method === 'GET') {
          const query = (url.searchParams.get('q') ?? '').toLowerCase();
          const archived = url.searchParams.get('archived');
          const rows = [...conversations.values()].filter(
            (row) =>
              row.workspace === workspace &&
              (!url.searchParams.get('projectId') ||
                row.conversation.project_id === url.searchParams.get('projectId')) &&
              (archived === 'only'
                ? row.conversation.archived
                : archived === 'exclude'
                  ? !row.conversation.archived
                  : true) &&
              (!query || row.conversation.title?.toLowerCase().includes(query)),
          );
          const offset = Number(url.searchParams.get('offset') ?? 0);
          const limit = Number(url.searchParams.get('limit') ?? 50);
          const page = rows.slice(offset, offset + limit);
          return json(
            response,
            ManagedCloudConversationListResponseSchema.parse({
              conversations: page.map((row) => row.conversation),
              hasMore: offset + page.length < rows.length,
              nextOffset: offset + page.length,
              nextCursor: null,
            }),
          );
        }
        assert.equal(request.method, 'POST');
        const input = ManagedCloudCreateConversationRequestSchema.parse(body);
        if (conversations.has(input.id))
          return error(response, 409, 'Fixture conversation already exists');
        if (input.projectId) {
          const target = projects.get(input.projectId);
          if (
            !target ||
            target.ownerUserId !== owner ||
            target.isArchived ||
            (target.organizationId ?? personal) !== workspace
          )
            return error(response, 404, 'Project is unavailable');
        }
        const row = conversation(
          `Fixture new conversation ${conversations.size + 1}`,
          workspace,
          'chat',
          input.id,
        );
        row.conversation.project_id = input.projectId ?? null;
        if (body.model) row.conversation.model = body.model;
        return json(response, { conversation: row.conversation });
      }
      if (url.pathname.startsWith(`${MANAGED_CLOUD_CHAT_BASE_PATH}/`)) {
        const [id, resource, messageId] = url.pathname
          .slice(MANAGED_CLOUD_CHAT_BASE_PATH.length + 1)
          .split('/');
        const row = conversations.get(id);
        if (!row || row.workspace !== workspace || row.unavailable)
          return error(response, 404, 'Fixture conversation not found in this workspace');
        if (resource === 'messages') {
          assert.equal(request.method, 'PATCH');
          const entry = row.messages.find((entry) => entry.id === messageId);
          assert(entry?.role === 'assistant');
          assert.deepEqual(Object.keys(body).sort(), ['expectedWorkPlanReview', 'workPlanReview']);
          if (
            !isDeepStrictEqual(
              body.expectedWorkPlanReview,
              entry.metadata?.agiWorkPlanReview ?? null,
            )
          )
            return error(response, 409, 'Fixture plan changed');
          entry.metadata = {
            ...entry.metadata,
            agiWorkPlanReview: body.workPlanReview,
            agiWorkPlan: body.workPlanReview.steps,
            agiWorkPlanDeclined: body.workPlanReview.declined,
          };
          row.revision += 1;
          return json(response, { id: entry.id, review: entry.metadata.agiWorkPlanReview });
        }
        response.setHeader('etag', `"${row.revision}"`);
        if (request.method === 'PUT') {
          if (Object.hasOwn(body, 'draft')) {
            const input = ManagedCloudUpdateConversationRequestSchema.parse(body);
            assert.deepEqual(Object.keys(body).sort(), ['draft', 'draftUpdatedAt']);
            assert.equal(request.headers['if-match'], undefined);
            const text = input.draft || null;
            if (
              text !== row.conversation.draft &&
              input.draftUpdatedAt !== row.conversation.draft_updated_at
            ) {
              return json(
                response,
                {
                  saved: false,
                  conflict: true,
                  current: {
                    draft: row.conversation.draft ?? '',
                    draftUpdatedAt: row.conversation.draft_updated_at,
                  },
                },
                409,
              );
            }
            if (text !== row.conversation.draft) {
              row.conversation.draft = text;
              row.conversation.draft_updated_at = stamp();
            }
            return json(response, {
              saved: true,
              draftUpdatedAt: row.conversation.draft_updated_at,
            });
          }
          if (request.headers['if-match'] !== `"${row.revision}"`)
            return json(
              response,
              {
                error: { message: 'This fixture conversation changed' },
                current: row.conversation,
              },
              412,
            );
          const input = ManagedCloudUpdateConversationRequestSchema.parse(body);
          assert.equal(Object.keys(input).length, 1);
          assert(
            Object.keys(input).every((key) =>
              ['title', 'model', 'pinned', 'archived'].includes(key),
            ),
          );
          Object.assign(row.conversation, input);
          if (input.archived === true) row.conversation.pinned = false;
          row.revision += 1;
          row.conversation.updated_at = stamp();
          response.setHeader('etag', `"${row.revision}"`);
          return json(response, { conversation: row.conversation });
        }
        assert.equal(request.method, 'GET');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        return json(
          response,
          ManagedCloudConversationResponseSchema.parse({
            conversation: row.conversation,
            messages: row.messages.slice(offset, offset + limit),
            total: row.messages.length,
            hasMore: offset + limit < row.messages.length,
          }),
        );
      }
      if (url.pathname === MANAGED_CLOUD_AGENT_RUNS_BASE_PATH) {
        assert.equal(request.method, 'GET');
        const states = url.searchParams.getAll('state');
        const rows = [...runs.values()].filter(
          (run) => run.workspace === workspace && (!states.length || states.includes(run.state)),
        );
        return json(
          response,
          CloudAgentRunListPageSchema.parse({ runs: rows.map(wire), nextCursor: null }),
        );
      }
      if (url.pathname.startsWith(`${MANAGED_CLOUD_AGENT_RUNS_BASE_PATH}/`)) {
        const [id, action] = url.pathname
          .slice(MANAGED_CLOUD_AGENT_RUNS_BASE_PATH.length + 1)
          .split('/');
        const run = runs.get(id);
        if (!run || run.workspace !== workspace)
          return error(response, 404, 'Fixture run not found in this workspace');
        if (request.method === 'POST' && action === 'resume') {
          assert.equal(run.state, 'paused');
          const event = append(run, {
            type: 'text-delta',
            delta: ' Resumed by an explicit native action.',
          });
          complete(
            run,
            run.events
              .filter((entry) => entry.event.type === 'text-delta')
              .map((entry) => entry.event.delta)
              .join(''),
          );
          streamStart(response, run, 'inline');
          streamFrame(response, { content: event.event.delta, x_agent_event: event });
          response.end('data: [DONE]\n\n');
          return;
        }
        if (request.method === 'POST') {
          assert.equal(action, undefined);
          run.cancellationRequestedAt = stamp();
          complete(
            run,
            run.events
              .filter((entry) => entry.event.type === 'text-delta')
              .map((entry) => entry.event.delta)
              .join(''),
            'cancelled',
          );
          return json(response, { run: wire(run) });
        }
        assert.equal(request.method, 'GET');
        const after = Number(url.searchParams.get('after') ?? -1);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const events = run.events.filter((entry) => entry.sequence > after).slice(0, limit);
        return json(
          response,
          CloudAgentRunSnapshotPageSchema.parse({
            run: wire(run),
            events,
            nextAfterSequence: events.at(-1)?.sequence ?? after,
          }),
        );
      }
      if (url.pathname === `${gatewayPath}/approve`) {
        assert.equal(request.method, 'POST');
        const run = runs.get(body.run_id);
        if (!run || run.workspace !== workspace)
          return error(response, 404, 'Fixture run not found in this workspace');
        assert.equal(run.state, 'awaiting_input');
        assert.equal(body.detached, true);
        assert.equal(body.tool_approvals.length, run.approvals.length);
        const decisions = run.approvals.map((action) => {
          const decision = body.tool_approvals.find(
            (entry) => entry.tool_call_id === action.toolCallId,
          )?.decision;
          assert(['approved', 'rejected'].includes(decision));
          return {
            type: 'approval-resolved',
            approvalId: action.approvalId,
            decision: decision === 'approved' ? 'approved' : 'denied',
          };
        });
        for (const decision of decisions) append(run, decision);
        const allowed = body.tool_approvals.every((entry) => entry.decision === 'approved');
        const text = allowed
          ? ' Fixture actions approved; no real tool was executed.'
          : ' Fixture actions denied; no real tool was executed.';
        append(run, { type: 'text-delta', delta: text });
        delete run.pendingApproval;
        complete(
          run,
          run.events
            .filter((entry) => entry.event.type === 'text-delta')
            .map((entry) => entry.event.delta)
            .join(''),
        );
        streamStart(response, run);
        response.end('data: [DONE]\n\n');
        return;
      }
      assert.equal(url.pathname, gatewayPath, `Unsupported native fixture route: ${route}`);
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['x-agi-surface'], 'desktop');
      assert.equal(request.headers['idempotency-key'], body.assistant_message_id);
      const row = conversations.get(body.conversation_id);
      assert(row && row.workspace === workspace);
      assert(
        fixtureModels.some(
          (model) => model.id === body.model && model.admitted && !model.temporarilyUnavailable,
        ),
      );
      if (requests.has(body.assistant_message_id))
        return json(
          response,
          {
            error: {
              code: 'idempotency_replay',
              message: 'This fixture turn already reached acceptance',
            },
          },
          409,
        );
      if (row.messages.length > 256 || runs.size > 100)
        return error(response, 429, 'Native fixture test budget reached');
      const current = body.messages.at(-1)?.content;
      const text =
        typeof current === 'string'
          ? current
          : current
              .filter((part) => part.type === 'text')
              .map((part) => part.text)
              .join('');
      assert.equal(typeof text, 'string');
      if (Array.isArray(current)) {
        assert(current.every((part) => part.type === 'text' || part.type === 'file'));
        const references = current
          .filter((part) => part.type === 'file')
          .map((part) => part.file.asset_id);
        const descriptors = body.user_message.metadata?.attachments ?? [];
        assert.deepEqual(
          references,
          descriptors.map((file) => file.assetId),
        );
        for (const file of descriptors) {
          const owned = projectUploads
            .attachments()
            .find((row) => row.workspace === workspace && row.attachment.id === file.assetId);
          if (!owned)
            return error(response, 403, 'The attachment is not available in this workspace');
          assert.equal(file.name, owned.attachment.name);
          assert.equal(file.mimeType, owned.attachment.mimeType);
          assert.equal(file.size, owned.attachment.byteCount);
          assert.equal(file.type, owned.attachment.type);
          assert.equal(file.url, owned.attachment.url);
        }
      }
      assert.deepEqual(
        body.messages.slice(0, -1).map(({ role, content }) => ({ role, content })),
        row.messages.map(({ role, content, metadata }) => ({
          role,
          content: metadata?.attachments?.length
            ? [
                ...(content.trim() ? [{ type: 'text', text: content }] : []),
                ...metadata.attachments.map((attachment) => ({
                  type: 'file',
                  file: { asset_id: attachment.assetId },
                })),
              ]
            : content,
        })),
      );
      message(row, 'user', text, body.user_message.id, body.user_message.metadata ?? null);
      if (body.work_mode) row.conversation.work_mode = body.work_mode;
      const run = runFor(row, row.conversation.title, 'running', body.assistant_message_id);
      run.model = body.model;
      requests.set(run.requestId, globalThis.structuredClone(body));
      const mode = nextStream;
      nextStream = 'complete';
      const planning = body.work_mode === AGI_WORK_MODE && !body.agi_work_plan;
      const result = planning
        ? 'Review this synthetic plan before execution.'
        : `Fixture reply ${requests.size}: 東京 🦀`;
      const event = append(run, { type: 'text-delta', delta: result });
      if (mode === 'lost-accept') {
        complete(run, result);
        response.destroy();
        return;
      }
      streamStart(response, run);
      const delta = { content: result, x_agent_event: event };
      if (planning) {
        row.conversation.work_mode = AGI_WORK_MODE;
        delta.x_agiwork_plan = {
          goal: body.agi_work_goal,
          steps: [
            'Read supplied information',
            'Prepare a synthetic report',
            'Verify the result',
          ].map((description, index) => ({
            id: `fixture-step-${index + 1}`,
            description,
            status: 'pending',
          })),
          awaiting_approval: true,
        };
      }
      streamFrame(response, delta);
      if (mode === 'hold') {
        run.response = response;
        return;
      }
      if (mode === 'approvals') {
        addApprovals(run);
        for (const entry of run.events.slice(1)) streamFrame(response, { x_agent_event: entry });
        response.end('data: [DONE]\n\n');
        return;
      }
      complete(run, result);
      response.end('data: [DONE]\n\n');
    } catch (failure) {
      failures.push({ message: failure.message, path: request.url, method: request.method });
      if (!response.headersSent) error(response, 500, failure.message);
      else response.destroy();
    }
  });
  return {
    server,
    jwt,
    owner,
    snapshot,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      projectUploads.close();
      fileActions.close();
      for (const run of runs.values()) if (run.response) run.response.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
