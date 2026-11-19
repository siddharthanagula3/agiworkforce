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
import { PRODUCT_NAMES } from '../../../../packages/contracts/types/src/product-names.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev', `${PRODUCT_NAMES.desktop}.app`);
const manifest = JSON.parse(
  fs.readFileSync(path.join(bundle, 'Contents/Resources/native-runtime.json'), 'utf8'),
);
const contract = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/contracts/cloud-contracts/src/conversation-contract.json'),
    'utf8',
  ),
);
const personalId = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/contracts/types/src/workspace-contract.json'), 'utf8'),
).personalSelector;
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-workspaces-'));
const jwt = `fixture.${Buffer.from(JSON.stringify({ sub: 'workspace-fixture', sid: 'workspace-device' })).toString('base64url')}.signature`;
const organizations = [randomUUID(), randomUUID()];
const workspaceIds = [randomUUID(), randomUUID()];
const conversations = new Map();
const runs = new Map();
let active = contract.personalWorkspace;
let revoked = false;
let selectionWrites = 0;
let lostAttempts = 0;
let gatewayRequests = 0;
let fixtureError;
const json = (response, body) => {
  response.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};
const summary = (run) => ({
  id: run.id,
  requestId: run.requestId,
  conversationId: run.conversationId,
  conversationTitle: 'Scoped conversation',
  conversationPreview: null,
  state: 'ready_for_review',
  originSurface: 'desktop',
  provider: 'fixture',
  model: 'fixture-workspace-model',
  updatedAt: '2026-11-09T00:00:00Z',
});
const server = http.createServer(async (request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${jwt}`);
    const url = new URL(request.url, 'http://127.0.0.1');
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
      assert(chunks.reduce((n, chunk) => n + chunk.length, 0) < 100_000);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (url.pathname === contract.workspacesPath) {
      if (request.method === 'GET') {
        const workspaces = [
          {
            id: randomUUID(),
            name: 'My personal space',
            slug: 'personal',
            kind: 'personal',
            organizationId: null,
            isPrimary: true,
            role: null,
          },
          ...organizations.flatMap((id, index) =>
            revoked && index === 0
              ? []
              : [
                  {
                    id: workspaceIds[index],
                    name: 'Example team',
                    slug: `team-${index + 1}`,
                    kind: 'organization',
                    organizationId: id,
                    isPrimary: true,
                    role: 'member',
                  },
                ],
          ),
        ];
        json(response, {
          accountId: 'workspace-fixture',
          workspaces,
          activeWorkspaceId:
            active === contract.personalWorkspace
              ? null
              : workspaceIds[organizations.indexOf(active)],
          activeOrganizationId: active === contract.personalWorkspace ? null : active,
          scope: active === contract.personalWorkspace ? 'personal' : 'organization',
        });
        return;
      }
      assert.equal(request.method, 'PUT');
      const index = workspaceIds.indexOf(body.workspaceId);
      if (body.workspaceId !== personalId && (index < 0 || (revoked && index === 0))) {
        response.statusCode = 403;
        json(response, { error: { message: 'Workspace unavailable' } });
        return;
      }
      active = body.workspaceId === personalId ? contract.personalWorkspace : organizations[index];
      selectionWrites += 1;
      if (index === 1) {
        lostAttempts += 1;
        response.destroy();
        return;
      }
      json(response, {
        workspaceId: body.workspaceId === personalId ? null : body.workspaceId,
        activeOrganizationId: active === contract.personalWorkspace ? null : active,
        scope: active === contract.personalWorkspace ? 'personal' : 'organization',
      });
      return;
    }
    const selected = request.headers[contract.organizationHeader];
    assert.equal(
      typeof selected,
      'string',
      'Every content request must explicitly pin its workspace',
    );
    if (
      (selected !== contract.personalWorkspace && !organizations.includes(selected)) ||
      (revoked && selected === organizations[0])
    ) {
      response.statusCode = 403;
      json(response, { error: { message: 'Workspace membership is unavailable' } });
      return;
    }
    if (url.pathname === '/api/chat/conversations') {
      if (request.method === 'GET') {
        if (url.searchParams.get('q') === 'revoke-first') revoked = true;
        json(response, {
          conversations: [...conversations.values()]
            .filter((row) => row.workspace === selected)
            .map((row) => row.conversation),
          hasMore: false,
          nextOffset: 0,
          nextCursor: null,
        });
        return;
      }
      assert.equal(request.method, 'POST');
      const conversation = {
        id: body.id,
        title: 'Scoped conversation',
        model: 'fixture-workspace-model',
        project_id: null,
        organization_id: selected === contract.personalWorkspace ? null : selected,
        archived: false,
        pinned: false,
        updated_at: '2026-11-09T00:00:00Z',
      };
      conversations.set(body.id, { workspace: selected, conversation, messages: [] });
      json(response, { conversation });
      return;
    }
    if (url.pathname.startsWith('/api/chat/conversations/')) {
      const row = conversations.get(url.pathname.split('/').at(-1));
      if (!row || row.workspace !== selected) {
        response.statusCode = 404;
        json(response, { error: { message: 'Conversation not found' } });
        return;
      }
      response.setHeader('etag', '"1"');
      json(response, {
        conversation: row.conversation,
        messages: row.messages,
        hasMore: false,
        total: row.messages.length,
      });
      return;
    }
    if (url.pathname === '/api/llm/v1/chat/completions/runs') {
      json(response, {
        runs: [...runs.values()].filter((run) => run.workspace === selected).map(summary),
        nextCursor: null,
      });
      return;
    }
    if (url.pathname.startsWith('/api/llm/v1/chat/completions/runs/')) {
      const run = runs.get(url.pathname.split('/').at(-1));
      if (!run || run.workspace !== selected) {
        response.statusCode = 404;
        json(response, { error: { message: 'Run not found' } });
        return;
      }
      const after = Number(url.searchParams.get('after') ?? -1);
      json(response, {
        run: summary(run),
        events: run.events.filter((event) => event.sequence > after),
        hasMore: false,
        nextAfterSequence: run.events.at(-1)?.sequence ?? after,
      });
      return;
    }
    assert.equal(url.pathname, '/api/llm/v1/chat/completions');
    assert.equal(request.method, 'POST');
    const row = conversations.get(body.conversation_id);
    assert(row && row.workspace === selected);
    assert.equal(body.messages.at(-1).content, 'Stay in the selected workspace');
    gatewayRequests += 1;
    const run = {
      id: randomUUID(),
      requestId: body.assistant_message_id,
      conversationId: body.conversation_id,
      workspace: selected,
      events: [],
    };
    const envelope = {
      schemaVersion: 5,
      sessionId: row.conversation.id,
      turnId: run.id,
      sequence: 0,
      emittedAtMs: 0,
      event: { type: 'text-delta', delta: 'Workspace-bound reply' },
    };
    run.events.push(envelope);
    runs.set(run.id, run);
    row.messages.push(
      { id: body.user_message.id, role: 'user', content: body.messages.at(-1).content },
      { id: body.assistant_message_id, role: 'assistant', content: 'Workspace-bound reply' },
    );
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'X-AGI-Agent-Run-Id': run.id,
      'X-AGI-Tool-Loop': 'durable',
    });
    response.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Workspace-bound reply', x_agent_event: envelope }, index: 0 }] })}\n\ndata: [DONE]\n\n`,
    );
  } catch (error) {
    fixtureError = error;
    if (!response.headersSent) response.writeHead(500);
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
      'real_cloud_workspaces_',
      '--',
      '--ignored',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        AGIWORKFORCE_HOME: config,
        AGIWORKFORCE_API_BASE: origin,
        AGI_AUTH_BASE: `${origin}/api`,
        AGIWORKFORCE_JWT: jwt,
        AGI_GPUI_WORKSPACES_FIXTURE: '1',
        AGI_GPUI_TEST_RUNTIME: path.join(bundle, 'Contents/MacOS', manifest.executable),
      },
      stdio: 'inherit',
    },
  );
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (fixtureError) throw fixtureError;
  assert.equal(code, 0);
  assert.equal(gatewayRequests, 1);
  assert.equal(selectionWrites, 2);
  assert.equal(lostAttempts, 1);
  process.stdout.write(
    'Packaged workspace membership/selection, lost-response recovery, frozen history/create/send/journal, cold attach and membership revocation passed.\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(config, { recursive: true, force: true });
}
