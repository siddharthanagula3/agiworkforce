import { z } from 'zod';
import {
  ManagedCloudAgentRunReferenceSchema,
  type ManagedCloudAgentRunReference,
} from './managed-cloud-agent-run-reference';

export const ToolApprovalDecisionSchema = z.object({
  tool_call_id: z.string().min(1).max(128),
  decision: z.enum(['approved', 'rejected']),
});
export type ToolApprovalDecisionWire = z.infer<typeof ToolApprovalDecisionSchema>;

export const TOOL_APPROVAL_GUIDANCE_MAX_LENGTH = 4_000;

export const ToolApprovalResumeRequestSchema = z.object({
  run_id: z.string().uuid(),
  tool_approvals: z.array(ToolApprovalDecisionSchema).min(1).max(32),
  guidance: z.string().trim().min(1).max(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH).optional(),
});
export type ToolApprovalResumeRequest = z.infer<typeof ToolApprovalResumeRequestSchema>;

export const MAX_TOOL_INPUT_RESPONSES_SERIALIZED_LENGTH = 16_000;

// One paused connector call's user-supplied responses to an MCP `input_required`
// pause. The values are echoed verbatim to the remote server on resume, so the
// host bounds their serialized size before accepting them.
export const ToolInputResponseSchema = z.object({
  tool_call_id: z.string().min(1).max(128),
  input_responses: z
    .record(z.string(), z.unknown())
    .refine(
      (value) => JSON.stringify(value).length <= MAX_TOOL_INPUT_RESPONSES_SERIALIZED_LENGTH,
      'input_responses exceed the size limit',
    ),
});
export type ToolInputResponseWire = z.infer<typeof ToolInputResponseSchema>;

export const ToolInputResumeRequestSchema = z.object({
  run_id: z.string().uuid(),
  tool_inputs: z.array(ToolInputResponseSchema).min(1).max(32),
  guidance: z.string().trim().min(1).max(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH).optional(),
});
export type ToolInputResumeRequest = z.infer<typeof ToolInputResumeRequestSchema>;

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

export const ToolApprovalResumeErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string(),
  }),
});
export type ToolApprovalResumeErrorResponse = z.infer<typeof ToolApprovalResumeErrorResponseSchema>;
