/**
 * Tests for the tool-approval resume request/error contract mirrored from
 * `apps/web/app/api/llm/v1/chat/completions/approve/route.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  ToolApprovalDecisionSchema,
  ToolApprovalResumeRequestSchema,
  ToolApprovalResumeErrorResponseSchema,
} from '../tool-approval-resume';

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
    tool_approvals: [{ tool_call_id: 'call_1', decision: 'approved' }],
    messages: [
      { role: 'user', content: 'do the thing' },
      {
        role: 'assistant',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'x', arguments: '{}' } }],
      },
    ],
  };

  it('accepts the resume body shape (resumeBodySchema, route.ts:57-67)', () => {
    expect(ToolApprovalResumeRequestSchema.safeParse(body).success).toBe(true);
  });

  it('accepts a body without messages (messages is optional)', () => {
    const { messages: _omitted, ...rest } = body;
    expect(ToolApprovalResumeRequestSchema.safeParse(rest).success).toBe(true);
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

  it('tolerates extra passthrough fields on tool_calls entries (route.ts:63)', () => {
    expect(ToolApprovalResumeRequestSchema.safeParse(body).success).toBe(true);
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
