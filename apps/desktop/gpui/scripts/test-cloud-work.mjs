import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { fileURLToPath, URL } from 'node:url';
import { PRODUCT_NAMES } from '../../../../packages/contracts/types/src/product-names.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const bundle = path.join(root, 'target/gpui-dev', `${PRODUCT_NAMES.desktop}.app`);
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
const workspaceOrganization = randomUUID();
const { organizationHeader } = JSON.parse(
  fs.readFileSync(
    path.join(root, 'packages/contracts/cloud-contracts/src/conversation-contract.json'),
    'utf8',
  ),
);
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-work-fixture-'));
const jwt = `fixture.${Buffer.from(JSON.stringify({ sub: 'work-fixture', sid: 'work-device' })).toString('base64url')}.signature`;
const runs = new Map();
const messages = [];
let conversation;
let posts = 0;
let decisions = 0;
let resumes = 0;
let fixtureError;
let listRequests = 0;
let disconnects = 0;
const cursors = new Set();
const json = (response, body) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};
const event = (run, payload) => ({
  schemaVersion: 5,
  sessionId: run.conversationId ?? run.id,
  turnId: run.id,
  sequence: run.events.length,
  emittedAtMs: 0,
  event: payload,
});
const append = (run, payload) => run.events.push(event(run, payload));
const wireRun = (run) => ({
  id: run.id,
  requestId: run.requestId ?? run.assistantId,
  conversationId: run.conversationId,
  conversationTitle: run.title,
  conversationPreview: run.prefix,
  state: run.state,
  workState: run.state === 'awaiting_input' ? 'awaiting_approval' : run.state,
  lastEventSequence: run.events.length - 1,
  pendingApproval: run.pendingApproval,
  originSurface: run.isWork ? 'web' : 'desktop',
  provider: 'fixture',
  model: conversation.model,
  updatedAt: '2026-11-09T00:00:00Z',
});
function seedWork() {
  for (const [title, state, linked] of [
    ['Pending report', 'awaiting_input', true],
    ['Unlinked analysis', 'paused', false],
    ['Completed report', 'completed', true],
  ]) {
    const run = {
      id: randomUUID(),
      requestId: state === 'completed' ? 'completed-request' : 'shared-recovery-request',
      assistantId: randomUUID(),
      conversationId: linked ? conversation.id : null,
      title,
      prefix: linked ? 'Recovered.' : 'Unlinked.',
      isWork: true,
      events: [],
      state,
      callId: 'recovered-action',
    };
    append(run, { type: 'text-delta', delta: run.prefix });
    if (state === 'awaiting_input') {
      append(run, {
        type: 'approval-requested',
        approvalId: run.callId,
        toolCallId: run.callId,
        name: 'fixture.write_report',
        category: 'other',
        summary: 'Write the recovered report',
        input: { path: 'recovered.txt', content: 'Recovered content' },
        riskLevel: 'high',
      });
      run.pendingApproval = {
        requestedAt: '2026-11-09T00:00:00Z',
        toolCalls: [
          { toolCallId: run.callId, name: 'fixture.write_report', argsPreview: '{preview}' },
        ],
      };
    }
    runs.set(run.id, run);
  }
}
const server = http.createServer(async (request, response) => {
  try {
    assert.equal(request.headers.authorization, `Bearer ${jwt}`);
    assert.equal(
      request.headers[organizationHeader],
      workspaceOrganization,
      'Work must retain its explicit workspace on every request',
    );
    const url = new URL(request.url, 'http://127.0.0.1');
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
      assert(chunks.reduce((total, part) => total + part.length, 0) <= 100_000);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (url.pathname === '/api/chat/conversations') {
      if (url.searchParams.get('q') === 'release-pending') {
        const pending = [...runs.values()].find((run) => run.callId === 'action-4');
        assert(pending);
        append(pending, pending.approvalEvent);
      }
      if (request.method === 'POST') {
        conversation = {
          ...golden.read.conversation,
          id: body.id,
          organization_id: workspaceOrganization,
          model: 'fixture-work-model',
        };
        seedWork();
        json(response, { conversation });
      } else
        json(response, {
          conversations: conversation ? [conversation] : [],
          hasMore: false,
          nextOffset: 0,
          nextCursor: null,
        });
      return;
    }
    if (conversation && url.pathname === `/api/chat/conversations/${conversation.id}`) {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1);
      json(response, {
        conversation,
        messages: messages.slice(offset, offset + limit),
        hasMore: offset + limit < messages.length,
        total: messages.length,
      });
      return;
    }
    if (
      url.pathname === '/api/llm/v1/chat/completions/approve' ||
      url.pathname.endsWith('/resume')
    ) {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['x-agi-surface'], 'desktop');
      const paused = url.pathname.endsWith('/resume');
      const run = runs.get(paused ? url.pathname.split('/').at(-2) : body.run_id);
      assert(run);
      assert.equal(run.state, paused ? 'paused' : 'awaiting_input');
      let suffix;
      if (paused) {
        assert.deepEqual(body, {});
        resumes += 1;
        suffix = ' Resumed.';
      } else {
        assert.equal(body.detached, true);
        assert.deepEqual(body.tool_approvals, [
          { tool_call_id: run.callId, decision: run.deny ? 'rejected' : 'approved' },
        ]);
        decisions += 1;
        suffix = run.deny ? ' Denied.' : ' Approved.';
        append(run, {
          type: 'approval-resolved',
          approvalId: run.callId,
          decision: run.deny ? 'denied' : 'approved',
        });
      }
      append(run, { type: 'text-delta', delta: suffix });
      run.pendingApproval = undefined;
      run.state = 'ready_for_review';
      if (run.conversationId !== null)
        messages.push({
          ...golden.read.messages[0],
          id: run.assistantId,
          role: 'assistant',
          content: `${run.prefix}${suffix}`,
        });
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'X-AGI-Agent-Run-Id': run.id,
        'X-AGI-Agent-Transport': paused ? 'inline' : 'durable',
      });
      if (paused) {
        run.resumeResponse = response;
        response.on('close', () => {
          if (!response.writableEnded)
            fixtureError = new Error(
              'The paused continuation was disconnected before its stream finished',
            );
        });
        response.write(': attached continuation\n\n');
      } else response.end('data: [DONE]\n\n');
      return;
    }
    if (url.pathname === '/api/llm/v1/chat/completions/runs') {
      assert.equal(request.method, 'GET');
      listRequests += 1;
      const states = url.searchParams.getAll('state');
      const rows = [...runs.values()].filter(
        (run) =>
          run.isWork && (states.length ? states.includes(run.state) : run.state !== 'completed'),
      );
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const limit = Number(url.searchParams.get('limit'));
      json(response, {
        runs: rows.slice(offset, offset + limit).map(wireRun),
        nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
      });
      return;
    }
    if (url.pathname.startsWith('/api/llm/v1/chat/completions/runs/')) {
      assert.equal(request.method, 'GET');
      const run = runs.get(url.pathname.split('/').at(-1));
      assert(run);
      if (run.resumeResponse && !run.resumeResponse.writableEnded)
        run.resumeResponse.end('data: [DONE]\n\n');
      const after = Number(url.searchParams.get('after'));
      const limit = Number(url.searchParams.get('limit'));
      cursors.add(after);
      const events = run.events.filter((entry) => entry.sequence > after).slice(0, limit);
      json(response, {
        run: wireRun(run),
        events,
        nextAfterSequence: events.at(-1)?.sequence ?? after,
      });
      return;
    }
    assert.equal(url.pathname, '/api/llm/v1/chat/completions');
    assert.equal(request.method, 'POST');
    posts += 1;
    assert(posts <= 5);
    const run = {
      id: randomUUID(),
      assistantId: body.assistant_message_id,
      callId: `action-${posts}`,
      events: [],
      state: posts === 2 ? 'paused' : posts === 5 ? 'running' : 'awaiting_input',
      deny: posts === 3,
      prefix: 'Before.',
      conversationId: conversation.id,
    };
    append(run, { type: 'text-delta', delta: 'Before.' });
    if (posts !== 2 && posts !== 5) {
      run.approvalEvent = {
        type: 'approval-requested',
        approvalId: run.callId,
        toolCallId: run.callId,
        name: 'fixture.write_report',
        category: 'other',
        summary: 'Write the reviewed report',
        input: { path: 'report.txt', content: 'A'.repeat(600) },
        riskLevel: 'high',
      };
      if (posts !== 4) append(run, run.approvalEvent);
      run.pendingApproval = {
        requestedAt: `2026-11-09T00:00:0${posts}Z`,
        toolCalls: [
          { toolCallId: run.callId, name: 'fixture.write_report', argsPreview: '{truncated}' },
        ],
      };
    }
    runs.set(run.id, run);
    messages.push({
      ...golden.read.messages[0],
      id: body.user_message.id,
      role: 'user',
      content: body.messages.at(-1).content,
    });
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'X-AGI-Agent-Run-Id': run.id,
      'X-AGI-Tool-Loop': 'durable',
    });
    if (posts === 5) {
      response.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Before.' }, index: 0 }] })}\n\n`,
      );
      setTimeout(() => {
        disconnects += 1;
        response.destroy();
      }, 50);
      return;
    }
    response.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Before.' }, index: 0 }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }] })}\n\ndata: [DONE]\n\n`,
    );
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
  const origin = `http://127.0.0.1:${server.address().port}`;
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
      'real_cloud_work_reviews_',
      '--',
      '--ignored',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        AGIWORKFORCE_HOME: configRoot,
        AGIWORKFORCE_API_BASE: origin,
        AGI_AUTH_BASE: `${origin}/api`,
        AGIWORKFORCE_JWT: jwt,
        AGI_GPUI_WORK_FIXTURE: '1',
        AGI_GPUI_WORKSCOPED_FIXTURE: '1',
        AGI_GPUI_WORKSPACE_ORGANIZATION: workspaceOrganization,
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
  assert.equal(posts, 5);
  assert.equal(disconnects, 1);
  assert.equal(decisions, 4);
  assert.equal(resumes, 2);
  assert.equal(listRequests, 3);
  assert(cursors.has(0) && cursors.has(1));
  process.stdout.write(
    'Real CLI approval, denial, continuation, cold recovery, run isolation and disconnect checks passed.\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(configRoot, { recursive: true, force: true });
}
