/**
 * Cloud contract — the tool-approval RESUME endpoint:
 *
 *   POST /api/llm/v1/chat/completions/approve
 *
 * Mirrors `apps/web/app/api/llm/v1/chat/completions/approve/route.ts`
 * (`resumeBodySchema` lines 52-67, `jsonError` lines 69-74).
 *
 * This endpoint is NOT a JSON-in/JSON-out route: on success it returns the
 * SAME `text/event-stream` SSE response as the main chat-completions route
 * (the tool-loop deltas in `./tool-events.ts` and `./generated-files.ts`),
 * not a JSON body — so there is no "success response" schema here, only the
 * request body and the one JSON error shape the route can return (400s
 * raised before the stream starts; see `jsonError`, route.ts:69-74).
 */

import { z } from 'zod';

/** One per-tool decision in the resume body (route.ts:52-55). */
export const ToolApprovalDecisionSchema = z.object({
  tool_call_id: z.string().min(1).max(128),
  decision: z.enum(['approved', 'rejected']),
});
export type ToolApprovalDecisionWire = z.infer<typeof ToolApprovalDecisionSchema>;

/**
 * The resume-specific fields the route reads off the request body
 * (`resumeBodySchema`, route.ts:57-67). `messages` is the full replayed
 * thread reused by `processRequest` for standard chat-completions
 * validation; only the shape this route itself inspects (`role`, and
 * `tool_calls[].id` for the pending-id gate, route.ts:81-100) is modeled
 * here — the rest of the OpenAI chat-completions message shape is out of
 * scope for this contract.
 */
export const ToolApprovalResumeRequestSchema = z.object({
  tool_approvals: z.array(ToolApprovalDecisionSchema).min(1).max(32),
  messages: z
    .array(
      z.object({
        role: z.string(),
        tool_calls: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
      }),
    )
    .optional(),
});
export type ToolApprovalResumeRequest = z.infer<typeof ToolApprovalResumeRequestSchema>;

/**
 * The one JSON error shape the route returns (`jsonError`, route.ts:69-74) —
 * always a 400 with `type: 'invalid_request_error'` and
 * `code: 'tool_approval_invalid'` today. `type`/`code` are typed as open
 * strings rather than literals so a future additional code does not fail
 * parsing.
 */
export const ToolApprovalResumeErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string(),
  }),
});
export type ToolApprovalResumeErrorResponse = z.infer<typeof ToolApprovalResumeErrorResponseSchema>;
