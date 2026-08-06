import { z } from 'zod';

import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { ApprovalMode, ResumeApproval } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { ManagedUsageRequestReservation } from '@/lib/services/managed-usage-request-service';

const MessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
    multimodal_content: z.array(z.unknown()).optional(),
    tool_calls: z.array(z.unknown()).optional(),
    tool_call_id: z.string().optional(),
    __canonicalThinking: z.array(z.unknown()).optional(),
  })
  .strict();

const LlmRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(MessageSchema),
    temperature: z.number().finite().optional(),
    max_tokens: z.number().int().positive(),
    stream: z.boolean().optional(),
    tools: z.array(z.unknown()).optional(),
    tool_choice: z.unknown().optional(),
    thinking_mode: z.boolean().optional(),
    thinking: z
      .object({ type: z.string().min(1), budget_tokens: z.number().int().positive().optional() })
      .strict()
      .optional(),
    effort: z.string().optional(),
    usePromptCache: z.boolean().optional(),
  })
  .strict();

const ProcessedRequestSchema = z
  .object({
    requestId: z.string().min(1),
    chatRequest: z
      .object({
        model: z.string().min(1),
        messages: z.array(z.unknown()),
        // Durable execution is no longer AGI Work's alone: an ordinary chat
        // that reaches for a tool starts a paid, resumable server-side run too,
        // and that run must survive the client that started it. `work_mode` is
        // absent entirely on plain OpenAI-compatible callers.
        work_mode: z.enum(['chat', 'agiwork']).optional(),
      })
      .passthrough(),
    conversationId: z.string().optional(),
    requestedModel: z.string().min(1),
    provider: z.string().min(1),
    estimatedCostCents: z.number().finite().nonnegative(),
    estimatedPromptTokens: z.number().int().nonnegative(),
    maxTokens: z.number().int().positive(),
    usedFallback: z.boolean(),
    fallbackReason: z.string().optional(),
    originalModel: z.string().min(1),
    fallbackModels: z.array(z.string().min(1)).optional(),
    subscriptionTier: z.string().min(1).optional(),
    resolvedTaskType: z.string().min(1),
    classifierConfidence: z.number().finite(),
    resolvedSlot: z.string().nullable(),
    quotaFeature: z.string().min(1),
    quotaWarningHeader: z.string().nullable(),
    isFlagshipRequest: z.boolean(),
    researchMode: z.boolean().optional(),
    indicResult: z.record(z.string(), z.unknown()),
    llmRequest: LlmRequestSchema,
    managedUsage: z.never().optional(),
    freeTrial: z.never().optional(),
  })
  .passthrough();

const BillingSchema = z
  .object({
    userId: z.string().min(1),
    idempotencyKey: z.string().min(8).max(128),
    requestHash: z.string().min(1),
    leaseToken: z.string().uuid(),
    estimatedCostCents: z.number().finite().nonnegative(),
  })
  .strict();

const McpToolSchema = z
  .object({
    qualifiedName: z.string().min(1),
    serverId: z.string().min(1),
    toolName: z.string().min(1),
    description: z.string(),
    origin: z.enum(['operator', 'connector']).optional(),
    inputSchema: z.record(z.string(), z.unknown()),
  })
  .strict();

export type SerializedProcessedRequest = Omit<ProcessedRequest, 'managedUsage' | 'freeTrial'>;
export type SerializedManagedUsageReservation = Omit<ManagedUsageRequestReservation, 'db'>;

export interface CloudAgentWorkflowInput {
  version: 1;
  runId: string;
  userId: string;
  processed: SerializedProcessedRequest;
  billing: SerializedManagedUsageReservation;
  mcpTools: WebMcpToolDef[];
  approvalMode: ApprovalMode;
  continuation?: {
    eventSessionId: string;
    eventTurnId: string;
    initialEventSequence: number;
    initialCompletedSteps: number;
    invocationContinuation: boolean;
    resume?: ResumeApproval;
  };
  predecessorApproval?: {
    checkpointId: string;
    leaseToken: string;
  };
}

const ContinuationSchema = z
  .object({
    eventSessionId: z.string().min(1),
    eventTurnId: z.string().min(1),
    initialEventSequence: z.number().int().nonnegative(),
    initialCompletedSteps: z.number().int().nonnegative(),
    invocationContinuation: z.boolean(),
    resume: z
      .object({
        approvals: z
          .array(
            z
              .object({
                toolCallId: z.string().min(1).max(256),
                decision: z.enum(['approved', 'rejected']),
              })
              .strict(),
          )
          .min(1)
          .max(32),
      })
      .strict()
      .optional(),
  })
  .strict();

const PredecessorApprovalSchema = z
  .object({
    checkpointId: z.string().uuid(),
    leaseToken: z.string().uuid(),
  })
  .strict();

const CloudAgentWorkflowInputSchema = z
  .object({
    version: z.literal(1),
    runId: z.string().uuid(),
    userId: z.string().min(1),
    processed: ProcessedRequestSchema,
    billing: BillingSchema,
    mcpTools: z.array(McpToolSchema),
    approvalMode: z.enum(['auto', 'manual']),
    continuation: ContinuationSchema.optional(),
    predecessorApproval: PredecessorApprovalSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.userId !== input.billing.userId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Workflow user does not own the managed usage reservation',
        path: ['billing', 'userId'],
      });
    }
  });

/** Validate the only state shape that may cross into Vercel Workflow storage. */
export function parseCloudAgentWorkflowInput(value: unknown): CloudAgentWorkflowInput {
  return CloudAgentWorkflowInputSchema.parse(value) as unknown as CloudAgentWorkflowInput;
}

/**
 * Build a JSON-stable workflow payload. Database adapters and free-tier state
 * are deliberately excluded because workflows may be persisted and replayed.
 */
export function buildCloudAgentWorkflowInput(input: {
  runId: string;
  userId: string;
  processed: ProcessedRequest;
  mcpTools: WebMcpToolDef[];
  approvalMode: ApprovalMode;
  continuation?: CloudAgentWorkflowInput['continuation'];
  predecessorApproval?: CloudAgentWorkflowInput['predecessorApproval'];
}): CloudAgentWorkflowInput {
  // The managed-usage reservation is the real admission control here, and it is
  // kept deliberately: a free-trial turn has no reservation to replay billing
  // against, so by construction it can never enter durable execution.
  if (!input.processed.managedUsage) {
    throw new Error('A managed usage reservation is required for durable AGI Work');
  }

  const { managedUsage, freeTrial: _freeTrial, ...processed } = input.processed;
  const { db: _db, ...billing } = managedUsage;
  const candidate = {
    version: 1 as const,
    runId: input.runId,
    userId: input.userId,
    processed,
    billing,
    mcpTools: input.mcpTools,
    approvalMode: input.approvalMode,
    continuation: input.continuation,
    predecessorApproval: input.predecessorApproval,
  };

  // Normalize away undefined object keys now so replayed input is byte-stable.
  return parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(candidate)));
}
