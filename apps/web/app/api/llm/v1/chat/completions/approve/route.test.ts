/**
 * Security boundary for the tool-approval RESUME endpoint: an approval that does
 * not reference a tool_call actually pending in the replayed assistant turn is
 * rejected with a 400 BEFORE any credit reservation, tool load, or stream — it
 * executes nothing. A valid approval passes the boundary and reaches
 * processRequest. (The execution semantics themselves are covered by
 * lib/tool-loop.resume.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRunAuthGate = vi.fn();
vi.mock('../lib/auth-gate', () => ({
  runAuthGate: (...args: unknown[]) => mockRunAuthGate(...args),
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildManagedComputeGateResponse: () => null,
}));

const mockProcessRequest = vi.fn();
vi.mock('../lib/request-processor', () => ({
  processRequest: (...args: unknown[]) => mockProcessRequest(...args),
}));

const mockRunToolLoop = vi.fn();
vi.mock('../lib/tool-loop', () => ({
  runToolLoop: (...args: unknown[]) => mockRunToolLoop(...args),
  loadMcpToolDefs: vi.fn(async () => []),
}));

vi.mock('@/lib/user-connector-tools', () => ({
  loadUserConnectorToolDefs: vi.fn(async () => []),
  makeUserConnectorExecutor: vi.fn(),
}));

import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const suspendedThread = [
  { role: 'user', content: 'summarize PR 7' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'mcp__github__get_pull_request_diff', arguments: '{}' },
      },
    ],
  },
];

describe('POST /api/llm/v1/chat/completions/approve — security boundary', () => {
  beforeEach(() => {
    mockRunAuthGate.mockReset();
    mockProcessRequest.mockReset();
    mockRunToolLoop.mockReset();
    mockRunAuthGate.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      token: 'tok',
      subscription: { plan_tier: 'pro' },
    });
  });

  it('rejects an approval whose tool_call_id is not pending (executes nothing)', async () => {
    const res = await POST(
      makeRequest({
        model: 'gpt-test',
        messages: suspendedThread,
        tool_approvals: [{ tool_call_id: 'call_FORGED', decision: 'approved' }],
      }),
    );

    expect(res.status).toBe(400);
    // Never reached processing or the tool loop.
    expect(mockProcessRequest).not.toHaveBeenCalled();
    expect(mockRunToolLoop).not.toHaveBeenCalled();
  });

  it('rejects when the thread has no suspended assistant tool_call turn', async () => {
    const res = await POST(
      makeRequest({
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
        tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
      }),
    );

    expect(res.status).toBe(400);
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('rejects a malformed body (missing tool_approvals)', async () => {
    const res = await POST(makeRequest({ model: 'gpt-test', messages: suspendedThread }));
    expect(res.status).toBe(400);
    expect(mockProcessRequest).not.toHaveBeenCalled();
  });

  it('forces extended thinking OFF on the resume continuation', async () => {
    // processRequest returns a processed carrying thinking on; the route must
    // strip it before driving the loop so an Anthropic tool_use continuation
    // does not require the (server-only) signed thinking block.
    const processed = {
      ok: true,
      quotaWarningHeader: null,
      chatRequest: { thinking_mode: true, thinking: { type: 'enabled' } },
      llmRequest: {
        thinking_mode: true,
        thinking: { type: 'enabled', budget_tokens: 1024 },
        effort: 'high',
      },
    };
    mockProcessRequest.mockResolvedValue(processed);
    mockRunToolLoop.mockReturnValue(
      (async function* () {
        // no chunks — the route just needs an async generator to drain.
      })(),
    );

    await POST(
      makeRequest({
        model: 'gpt-test',
        messages: suspendedThread,
        tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
      }),
    );

    expect(mockRunToolLoop).toHaveBeenCalledTimes(1);
    const passedProcessed = mockRunToolLoop.mock.calls[0]![0] as typeof processed;
    expect(passedProcessed.llmRequest.thinking_mode).toBeUndefined();
    expect(passedProcessed.llmRequest.thinking).toBeUndefined();
    expect(passedProcessed.llmRequest.effort).toBeUndefined();
    expect(passedProcessed.chatRequest.thinking_mode).toBeUndefined();
  });

  it('passes the boundary and reaches processRequest for a valid pending approval', async () => {
    // processRequest short-circuits with a failure response so we only assert the
    // security boundary was cleared (it was called).
    mockProcessRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'stop-here' }, { status: 402 }),
    });

    const res = await POST(
      makeRequest({
        model: 'gpt-test',
        messages: suspendedThread,
        tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
      }),
    );

    expect(mockProcessRequest).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(402);
  });
});
