/**
 * Tests for the tool-approval resume request/error contract mirrored from
 * `apps/web/app/api/llm/v1/chat/completions/approve/route.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  CloudToolApprovalProjectionSchema,
  readPersistedCloudToolApproval,
  ToolApprovalDecisionSchema,
  ToolApprovalResumeRequestSchema,
  ToolApprovalResumeErrorResponseSchema,
} from '../tool-approval-resume';

describe('CloudToolApprovalProjectionSchema', () => {
  const projection = {
    schemaVersion: 1,
    runId: '0190a000-0000-7000-8000-000000000001',
    calls: [{ toolCallId: 'call_1', name: 'shell', input: '{"command":"pwd"}' }],
  };

  it('accepts a bounded display-only approval projection', () => {
    expect(CloudToolApprovalProjectionSchema.safeParse(projection).success).toBe(true);
  });

  it('rejects an empty projection so stale empty cards cannot masquerade as pending input', () => {
    expect(CloudToolApprovalProjectionSchema.safeParse({ ...projection, calls: [] }).success).toBe(
      false,
    );
  });

  it('reads a projection only when its validated durable run reference matches', () => {
    expect(
      readPersistedCloudToolApproval({
        cloudAgentRun: {
          runId: projection.runId,
          runPath: `/api/llm/v1/chat/completions/runs/${projection.runId}`,
          lastSequence: 4,
          state: 'awaiting_input',
        },
        cloudApproval: projection,
      }),
    ).toEqual({
      runReference: {
        runId: projection.runId,
        runPath: `/api/llm/v1/chat/completions/runs/${projection.runId}`,
        lastSequence: 4,
        state: 'awaiting_input',
      },
      projection,
    });
  });

  it('rejects a projection copied from a different run', () => {
    expect(
      readPersistedCloudToolApproval({
        cloudAgentRun: {
          runId: projection.runId,
          runPath: `/api/llm/v1/chat/completions/runs/${projection.runId}`,
          lastSequence: 4,
        },
        cloudApproval: {
          ...projection,
          runId: '0190a000-0000-7000-8000-000000000002',
        },
      }),
    ).toBeNull();
  });
});

describe('ToolApprovalDecisionSchema', () => {
  it('accepts an approved decision', () => {
    expect(
      ToolApprovalDecisionSchema.safeParse({ tool_call_id: 'call_1', decision: 'approved' })
        .success,
    ).toBe(true);
  });

  it('rejects a decision outside approved/rejected (route.ts:54)', () => {
    expect(
      ToolApprovalDecisionSchema.safeParse({ tool_call_id: 'call_1', decision: 'maybe' }).success,
    ).toBe(false);
  });
});

describe('ToolApprovalResumeRequestSchema', () => {
  const body = {
    run_id: '0190a000-0000-7000-8000-000000000001',
    tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
  };

  it('accepts a server-owned run reference plus per-tool decisions', () => {
    expect(ToolApprovalResumeRequestSchema.safeParse(body).success).toBe(true);
  });

  it('rejects the former client-replayed transcript contract', () => {
    expect(
      ToolApprovalResumeRequestSchema.safeParse({
        tool_approvals: body.tool_approvals,
        messages: [{ role: 'assistant', tool_calls: [{ id: 'call_1' }] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed run id', () => {
    expect(ToolApprovalResumeRequestSchema.safeParse({ ...body, run_id: 'run-1' }).success).toBe(
      false,
    );
  });

  it('rejects an empty tool_approvals array (min(1), route.ts:58)', () => {
    expect(ToolApprovalResumeRequestSchema.safeParse({ ...body, tool_approvals: [] }).success).toBe(
      false,
    );
  });

  it('rejects more than 32 tool_approvals (max(32), route.ts:58)', () => {
    const many = Array.from({ length: 33 }, (_, i) => ({
      tool_call_id: `call_${i}`,
      decision: 'approved' as const,
    }));
    expect(
      ToolApprovalResumeRequestSchema.safeParse({ ...body, tool_approvals: many }).success,
    ).toBe(false);
  });

  it('strips unrelated chat fields instead of accepting a client execution checkpoint', () => {
    const parsed = ToolApprovalResumeRequestSchema.parse({
      ...body,
      model: 'untrusted-model',
      messages: [{ role: 'assistant', tool_calls: [{ id: 'call_1' }] }],
    });
    expect(parsed).toEqual(body);
  });
});

describe('ToolApprovalResumeErrorResponseSchema', () => {
  it('accepts the jsonError shape (route.ts:69-74)', () => {
    const errorBody = {
      error: {
        message: 'Invalid or missing tool_approvals in resume request.',
        type: 'invalid_request_error',
        code: 'tool_approval_invalid',
      },
    };
    expect(ToolApprovalResumeErrorResponseSchema.safeParse(errorBody).success).toBe(true);
  });

  it('rejects a body missing the error wrapper', () => {
    expect(
      ToolApprovalResumeErrorResponseSchema.safeParse({ message: 'bad request' }).success,
    ).toBe(false);
  });
});
