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
import { AGI_WORK_MODE } from '../../../../packages/contracts/types/src/runtime.ts';

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
const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-gpui-work-start-'));
const jwt = `fixture.${Buffer.from(JSON.stringify({ sub: 'work-start', sid: 'work-start-device' })).toString('base64url')}.signature`;
const messages = [];
const runs = new Map();
const requests = new Map();
let conversation;
let serverError;
let attempts = 0;
let planning = 0;
let execution = 0;
let replays = 0;
let saves = 0;
const json = (response, body, status = 200) => {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
};
const emit = (run, payload) => ({
  schemaVersion: 5,
  sessionId: conversation.id,
  turnId: run.id,
  sequence: run.events.length,
  emittedAtMs: 0,
  event: payload,
});
function stream(response, record) {
  const { run, plan, goal } = record;
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'X-AGI-Agent-Run-Id': run.id,
    'X-AGI-Tool-Loop': 'durable',
  });
  const frame = {
    choices: [
      {
        index: 0,
        delta: {
          content: run.text,
          x_agiwork_plan: { goal, steps: run.steps, awaiting_approval: plan },
        },
      },
    ],
  };
  response.end(
    `data: ${JSON.stringify(frame)}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
  );
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
      assert(chunks.reduce((count, part) => count + part.length, 0) <= 100_000);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (url.pathname === '/api/chat/conversations') {
      if (request.method === 'POST') {
        assert.deepEqual(Object.keys(body), ['id']);
        conversation = {
          ...golden.read.conversation,
          id: body.id,
          organization_id: workspaceOrganization,
          model: 'fixture-work-start',
        };
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
      const limit = Number(url.searchParams.get('limit') ?? 50);
      json(response, {
        conversation,
        messages: messages.slice(offset, offset + limit),
        total: messages.length,
        hasMore: offset + limit < messages.length,
      });
      return;
    }
    if (
      conversation &&
      url.pathname.startsWith(`/api/chat/conversations/${conversation.id}/messages/`)
    ) {
      assert.equal(request.method, 'PATCH');
      saves += 1;
      if (saves === 1) {
        json(response, { error: { message: 'Fixture plan storage unavailable' } }, 503);
        return;
      }
      const message = messages.find((message) => message.id === url.pathname.split('/').at(-1));
      assert(message);
      assert.equal(message.role, 'assistant');
      assert.deepEqual(Object.keys(body).sort(), ['expectedWorkPlanReview', 'workPlanReview']);
      assert.deepEqual(body.expectedWorkPlanReview, message.metadata.agiWorkPlanReview ?? null);
      message.metadata = {
        ...message.metadata,
        agiWorkPlanReview: body.workPlanReview,
        agiWorkPlan: body.workPlanReview.steps,
        agiWorkPlanDeclined: body.workPlanReview.declined,
      };
      assert.equal(message.metadata.fixtureProvenance, true);
      json(response, { id: message.id, review: message.metadata.agiWorkPlanReview });
      return;
    }
    if (url.pathname.startsWith('/api/llm/v1/chat/completions/runs/')) {
      assert.equal(request.method, 'GET');
      const run = runs.get(url.pathname.split('/').at(-1));
      assert(run);
      const after = Number(url.searchParams.get('after') ?? -1);
      const limit = Number(url.searchParams.get('limit') ?? 1);
      const events = run.events.filter((event) => event.sequence > after).slice(0, limit);
      json(response, {
        run: {
          id: run.id,
          requestId: run.requestId,
          conversationId: conversation.id,
          state: 'ready_for_review',
          workMode: AGI_WORK_MODE,
          originSurface: 'desktop',
          model: conversation.model,
          provider: 'fixture',
          updatedAt: '2026-11-09T00:00:00Z',
          lastEventSequence: run.events.length - 1,
        },
        events,
        nextAfterSequence: events.at(-1)?.sequence ?? after,
      });
      return;
    }
    assert.equal(url.pathname, '/api/llm/v1/chat/completions');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-agi-surface'], 'desktop');
    assert.equal(body.work_mode, AGI_WORK_MODE);
    assert.equal(request.headers['idempotency-key'], body.assistant_message_id);
    const key = body.assistant_message_id;
    if (requests.has(key)) {
      const old = requests.get(key);
      assert.deepEqual(body, old.body);
      replays += 1;
      json(
        response,
        {
          error: {
            message:
              'This idempotency key has already reached a terminal state. Start a deliberate new turn with a new key.',
            code: 'idempotency_replay',
          },
        },
        409,
      );
      return;
    }
    attempts += 1;
    if (body.agi_work_goal.goal === 'Denied goal') {
      json(response, { error: { message: 'Fixture Work entitlement refused' } }, 403);
      return;
    }
    const plan = !body.agi_work_plan;
    if (plan) {
      planning += 1;
      assert.equal(body.agi_work_plan_approval, true);
    } else {
      execution += 1;
      assert.equal(body.agi_work_plan_approval, undefined);
      const review = messages
        .map((message) => message.metadata?.agiWorkPlanReview)
        .find((review) => review?.reviewId === key);
      assert(review);
      assert.equal(review.declined, false);
      assert.deepEqual(
        body.agi_work_plan.steps,
        review.steps.map((step) => step.description),
      );
      assert.deepEqual(body.agi_work_goal, review.goal);
      assert.equal(body.messages.length, 5);
    }
    const run = {
      id: randomUUID(),
      requestId: key,
      text: plan ? 'Review this plan before execution.' : 'Finished the reviewed work.',
      events: [],
      steps: ['Gather supplied information', 'Prepare the report', 'Check the result'].map(
        (description, index) => ({
          id: `step-${index + 1}`,
          description,
          status: plan ? 'pending' : 'completed',
        }),
      ),
    };
    run.events.push(emit(run, { type: 'text-delta', delta: run.text }));
    runs.set(run.id, run);
    messages.push({
      ...golden.read.messages[0],
      id: body.user_message.id,
      role: 'user',
      content: body.messages.at(-1).content,
      model: conversation.model,
    });
    messages.push({
      ...golden.read.messages[0],
      id: key,
      role: 'assistant',
      content: run.text,
      model: conversation.model,
      metadata: { fixtureProvenance: true },
    });
    conversation.work_mode = AGI_WORK_MODE;
    const record = { run, body: globalThis.structuredClone(body), plan, goal: body.agi_work_goal };
    requests.set(key, record);
    stream(response, record);
  } catch (error) {
    serverError = error;
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
      'real_cloud_work_start_',
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
        AGI_GPUI_WORK_START_FIXTURE: '1',
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
  if (serverError) throw serverError;
  assert.equal(code, 0);
  assert.equal(attempts, 4);
  assert.equal(planning, 2);
  assert.equal(execution, 1);
  assert.equal(replays, 1);
  assert.equal(saves, 5);
  process.stdout.write(
    'Real CLI Work creation, entitlement refusal, plan persistence/recovery, decisions and idempotent execution passed.\n',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(configRoot, { recursive: true, force: true });
}
