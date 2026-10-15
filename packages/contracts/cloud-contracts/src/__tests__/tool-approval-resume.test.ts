import { describe, expect, it } from 'vitest';
import {
  CloudToolApprovalProjectionSchema,
  isApprovingToolDecision,
  readPersistedCloudToolApproval,
  readToolApprovalReview,
  ToolApprovalDecisionSchema,
  ToolApprovalResumeRequestSchema,
  ToolApprovalResumeErrorResponseSchema,
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  TOOL_CALL_ID_MAX_LENGTH,
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

  it('preserves a selected scope while retaining the existing approved/rejected projection', () => {
    const scoped = {
      ...projection,
      calls: [{ ...projection.calls[0], approvalDecision: 'approved', approvalScope: 'session' }],
    };
    expect(CloudToolApprovalProjectionSchema.parse(scoped)).toEqual(scoped);
    expect(
      CloudToolApprovalProjectionSchema.safeParse({
        ...scoped,
        calls: [{ ...scoped.calls[0], approvalScope: 'all-workspaces' }],
      }).success,
    ).toBe(false);
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
  it('retains the current tool-call boundary for every approval scope', () => {
    for (const decision of ['approved', 'approved-for-session', 'approved-always', 'rejected']) {
      expect(
        ToolApprovalDecisionSchema.safeParse({
          tool_call_id: 'x'.repeat(TOOL_CALL_ID_MAX_LENGTH),
          decision,
        }).success,
      ).toBe(true);
      expect(
        ToolApprovalDecisionSchema.safeParse({
          tool_call_id: 'x'.repeat(TOOL_CALL_ID_MAX_LENGTH + 1),
          decision,
        }).success,
      ).toBe(false);
    }
  });

  it('accepts an approved decision', () => {
    expect(
      ToolApprovalDecisionSchema.safeParse({ tool_call_id: 'call_1', decision: 'approved' })
        .success,
    ).toBe(true);
  });

  it.each(['approved-for-session', 'approved-always'])('accepts the %s scope', (decision) => {
    expect(ToolApprovalDecisionSchema.safeParse({ tool_call_id: 'call_1', decision }).success).toBe(
      true,
    );
  });

  it('treats every scope except rejected as approving the call', () => {
    expect(isApprovingToolDecision('approved')).toBe(true);
    expect(isApprovingToolDecision('approved-for-session')).toBe(true);
    expect(isApprovingToolDecision('approved-always')).toBe(true);
    expect(isApprovingToolDecision('rejected')).toBe(false);
  });

  it('rejects a decision outside the published scopes (route.ts:54)', () => {
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

  it('preserves detached transport and steering with a scoped approval', () => {
    const input = {
      ...body,
      tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved-for-session' }],
      guidance: 'Keep the workspace policy.',
      detached: true,
    };
    expect(ToolApprovalResumeRequestSchema.parse(input)).toEqual(input);
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

  it('accepts trimmed steering guidance alongside the decisions', () => {
    const parsed = ToolApprovalResumeRequestSchema.parse({
      ...body,
      guidance: '  Skip the staging repo.  ',
    });
    expect(parsed.guidance).toBe('Skip the staging repo.');
  });

  it('rejects whitespace-only guidance so an empty steer never becomes a user turn', () => {
    expect(ToolApprovalResumeRequestSchema.safeParse({ ...body, guidance: '   ' }).success).toBe(
      false,
    );
  });

  it('rejects guidance beyond the shared length bound', () => {
    expect(
      ToolApprovalResumeRequestSchema.safeParse({
        ...body,
        guidance: 'x'.repeat(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH + 1),
      }).success,
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

describe('readToolApprovalReview', () => {
  it('reads the risk, destructiveness and offered scopes from the approval request', () => {
    expect(
      readToolApprovalReview({
        tool_call_id: 'call_1',
        risk_tier: 'critical',
        destructive: true,
        approval_scopes: ['once', 'session', 'session'],
      }),
    ).toEqual({ riskTier: 'critical', destructive: true, scopes: ['once', 'session'] });
  });

  it('reads nothing from a request without a review, so the card falls back to once', () => {
    expect(readToolApprovalReview({ tool_call_id: 'call_1' })).toBeUndefined();
    expect(
      readToolApprovalReview({
        risk_tier: 'extreme',
        destructive: false,
        approval_scopes: ['once'],
      }),
    ).toBeUndefined();
  });
});
