/**
 * Cloud contract — the tool-approval RESUME endpoint:
 *
 *   POST /api/llm/v1/chat/completions/approve
 *
 * The client identifies the tenant-owned suspended run and submits decisions.
 * The server loads the validated execution checkpoint; model, messages, tool
 * arguments, and provider continuity state never round-trip through the client.
 *
 * This endpoint is NOT a JSON-in/JSON-out route: on success it returns the
 * SAME `text/event-stream` SSE response as the main chat-completions route
 * (the tool-loop deltas in `./tool-events.ts` and `./generated-files.ts`),
 * not a JSON body — so there is no "success response" schema here, only the
 * request body and the one JSON error shape the route can return (400s
 * raised before the stream starts; see `jsonError`, route.ts:69-74).
 */

import { z } from 'zod';
// Imported from the leaf module rather than `./managed-cloud-agent-runs-client`
// (which re-exports it): that client imports the resume request schema from
// here, so taking the reference schema from it would close a runtime require
// cycle.
import {
  ManagedCloudAgentRunReferenceSchema,
  type ManagedCloudAgentRunReference,
} from './managed-cloud-agent-run-reference';

/** One per-tool decision in the resume body. */
export const ToolApprovalDecisionSchema = z.object({
  tool_call_id: z.string().min(1).max(128),
  decision: z.enum(['approved', 'rejected']),
});
export type ToolApprovalDecisionWire = z.infer<typeof ToolApprovalDecisionSchema>;

/**
 * Only the stable run reference and explicit decisions cross the trust
 * boundary. Unknown chat fields are stripped by Zod and never become an
 * execution source.
 */
export const ToolApprovalResumeRequestSchema = z.object({
  run_id: z.string().uuid(),
  tool_approvals: z.array(ToolApprovalDecisionSchema).min(1).max(32),
});
export type ToolApprovalResumeRequest = z.infer<typeof ToolApprovalResumeRequestSchema>;

/**
 * Safe, display-only projection stored in cloud message metadata so another
 * signed-in surface can reconstruct pending approval cards. The server never
 * uses this projection to resume execution: tool arguments and provider state
 * are loaded exclusively from the tenant-owned approval checkpoint.
 */
export const CloudToolApprovalProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().uuid(),
  calls: z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(128),
        name: z.string().min(1).max(200),
        input: z.string().max(100_000).optional(),
        approvalDecision: z.enum(['approved', 'rejected']).optional(),
      }),
    )
    .min(1)
    .max(32),
});
export type CloudToolApprovalProjection = z.infer<typeof CloudToolApprovalProjectionSchema>;

export interface PersistedCloudToolApproval {
  runReference: ManagedCloudAgentRunReference;
  projection: CloudToolApprovalProjection;
}

/**
 * Read a pending approval from persisted message metadata. Both halves must be
 * valid and name the same run; a display projection can never substitute for
 * the signed-in tenant's durable run reference.
 */
export function readPersistedCloudToolApproval(
  metadata: unknown,
): PersistedCloudToolApproval | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const runReference = ManagedCloudAgentRunReferenceSchema.safeParse(record['cloudAgentRun']);
  const projection = CloudToolApprovalProjectionSchema.safeParse(record['cloudApproval']);
  if (
    !runReference.success ||
    !projection.success ||
    runReference.data.runId !== projection.data.runId
  ) {
    return null;
  }
  return { runReference: runReference.data, projection: projection.data };
}

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
