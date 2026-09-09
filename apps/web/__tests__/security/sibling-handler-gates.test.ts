import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

function source(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

/**
 * Each of these is a gate that existed on one handler and not on its siblings,
 * so the control was real and the route next to it was not covered by it. They
 * are asserted at the source rather than by driving each route, because what
 * went wrong was a call site missing, not a decision being wrong.
 */
describe('a billable code session answers to the managed-compute gate on every entry point', () => {
  const ROUTES = [
    'app/api/code/sessions/[sessionId]/notebook/files/route.ts',
    'app/api/code/sessions/[sessionId]/notebook/files/[...path]/route.ts',
    'app/api/code/sessions/[sessionId]/changes/route.ts',
  ];

  it.each(ROUTES)('%s runs the gate', (route) => {
    const text = source(route);

    expect(text).toContain('evaluateManagedComputeAccess');
    expect(text).toContain('buildManagedComputeAccessGateResponse');
  });

  it.each(ROUTES)('%s runs the gate before it reaches the session service', (route) => {
    const text = source(route);

    const gate = text.indexOf('buildManagedComputeAccessGateResponse(');
    const service = text.search(/await (list|read|write)CloudCode/);

    expect(gate).toBeGreaterThan(-1);
    expect(service, `${route} no longer calls a cloud-code service`).toBeGreaterThan(-1);
    expect(gate, `${route} provisions the sandbox before asking whether it may`).toBeLessThan(
      service,
    );
  });
});

describe('the workspace connector policy is not answered as a personal account', () => {
  const ROUTES = [
    'app/api/connectors/custom/route.ts',
    'app/api/connectors/[connectorId]/credentials/route.ts',
  ];

  // The gate reads an explicit `organizationId: null` as "personal account,
  // skip policy" and answers before its own workspace lookup. Both routes read
  // the database on a deliberately null-org scope, so passing that null through
  // made the policy inert; omitting the key is what makes the gate resolve.
  it.each(ROUTES)('%s omits organizationId so the gate resolves it', (route) => {
    const text = source(route);

    const call = /evaluateConnectorPolicyForUser\(\{([\s\S]*?)\}\)/.exec(text)?.[1];

    expect(call, `${route} no longer calls the connector policy gate`).toBeDefined();
    expect(call).not.toContain('organizationId');
  });
});

describe('every entry point that starts an agent turn takes a concurrency slot', () => {
  const ROUTES = [
    'app/api/llm/v1/chat/completions/route.ts',
    'app/api/llm/v1/chat/completions/approve/route.ts',
    'app/api/llm/v1/chat/completions/resume-input/route.ts',
  ];

  it.each(ROUTES)('%s dispatches through withManagedTurnSlot', (route) => {
    expect(source(route)).toContain('withManagedTurnSlot');
  });

  it('keeps the acquire-and-attach pair in one place', () => {
    const helper = source('app/api/llm/v1/chat/completions/lib/turn-slot.ts');

    expect(helper).toContain('acquireManagedTurnSlot');
    expect(helper).toContain('attachTurnSlotToStream');
  });
});

describe('a caller-supplied conversation id is proved before it is read', () => {
  it('route preview checks ownership on the scoped handle first', () => {
    const text = source('app/api/llm/v1/route/preview/route.ts');

    const ownership = text.indexOf('from public.web_conversations where id = $1 and user_id = $2');
    const affinity = text.indexOf('getServedRouteAffinity(');

    expect(ownership, 'ownership is not proved at all').toBeGreaterThan(-1);
    expect(ownership).toBeLessThan(affinity);
  });
});
