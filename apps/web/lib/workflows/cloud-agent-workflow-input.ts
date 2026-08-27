import { z } from 'zod';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { TOOL_APPROVAL_GUIDANCE_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { ApprovalMode, ResumeApproval } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import type { FreeTrialReservation } from '@/lib/services/free-trial-service';
import type { ManagedUsageRequestReservation } from '@/lib/services/managed-usage-request-service';
import { TOOL_APPROVAL_POLICIES, type ToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';
import type {
  ConnectorToolPermissionEntry,
  ConnectorToolPermissions,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';

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
    organizationId: z.string().uuid().nullable().optional(),
    chatRequest: z
      .object({
        model: z.string().min(1),
        messages: z.array(z.unknown()),
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

// The transport carries EITHER reservation, discriminated on `kind`. Durability
// is a property of the transport, not of the tier that paid for the turn: a
// free-trial turn is just as capable of outliving its client connection, and
// before this union it was the only tier that could not (AGI-126).
//
// `provider`/`model`/`quotaFeature` are listed because `reserveManagedUsageRequest`
// really returns them. The previous `.strict()` shape omitted all three, so every
// production reservation failed this parse -- see the regression test in
// cloud-agent-workflow-input.test.ts.
const ManagedBillingSchema = z
  .object({
    kind: z.literal('managed'),
    userId: z.string().min(1),
    idempotencyKey: z.string().min(8).max(128),
    requestHash: z.string().min(1),
    leaseToken: z.string().uuid(),
    estimatedCostCents: z.number().finite().nonnegative(),
    quotaFeature: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .strict();

const FreeTrialBillingSchema = z
  .object({
    kind: z.literal('free_trial'),
    userId: z.string().min(1),
    requestId: z.string().min(1).max(256),
    reservedMicrousd: z.number().finite().nonnegative(),
  })
  .strict();

const BillingSchema = z.discriminatedUnion('kind', [ManagedBillingSchema, FreeTrialBillingSchema]);

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
export type SerializedManagedUsageReservation = Omit<ManagedUsageRequestReservation, 'db'> & {
  kind: 'managed';
};
export type SerializedFreeTrialReservation = FreeTrialReservation;

/** Whichever reservation paid for this turn, carried across the invocation boundary. */
export type CloudAgentWorkflowBilling =
  | SerializedManagedUsageReservation
  | SerializedFreeTrialReservation;

export interface CloudAgentWorkflowInput {
  version: 1;
  runId: string;
  userId: string;
  processed: SerializedProcessedRequest;
  billing: CloudAgentWorkflowBilling;
  mcpTools: WebMcpToolDef[];
  approvalMode: ApprovalMode;
  toolApprovalPolicy?: ToolApprovalPolicy;
  connectorPermissions?: ConnectorToolPermissionEntry[];
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
          .max(32)
          .optional(),
        inputResponses: z
          .array(
            z
              .object({
                toolCallId: z.string().min(1).max(256),
                inputResponses: z.record(z.string(), z.unknown()),
                requestState: z.string().optional(),
                round: z.number().int().nonnegative(),
              })
              .strict(),
          )
          .min(1)
          .max(32)
          .optional(),
        guidance: z.string().trim().min(1).max(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH).optional(),
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
    toolApprovalPolicy: z.enum(TOOL_APPROVAL_POLICIES).optional(),
    connectorPermissions: z
      .array(
        z.object({
          connectorId: z.string().min(1),
          toolName: z.string().min(1),
          level: z.enum(['allow', 'ask', 'deny']),
        }),
      )
      .optional(),
    continuation: ContinuationSchema.optional(),
    predecessorApproval: PredecessorApprovalSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.userId !== input.billing.userId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Workflow user does not own the billing reservation',
        path: ['billing', 'userId'],
      });
    }
  });

export function parseCloudAgentWorkflowInput(value: unknown): CloudAgentWorkflowInput {
  return CloudAgentWorkflowInputSchema.parse(value) as unknown as CloudAgentWorkflowInput;
}

/**
 * A turn arrived at the durable transport carrying neither a managed-usage nor a
 * free-trial reservation. Named so a caller can tell "this turn is not billable
 * through either tier" (degrade quietly to the inline transport) apart from "the
 * Workflow platform is down" (degrade loudly).
 */
export class CloudAgentWorkflowBillingUnavailableError extends Error {
  constructor() {
    super('A managed usage or free-trial reservation is required to start a durable agent turn');
    this.name = 'CloudAgentWorkflowBillingUnavailableError';
  }
}

/**
 * The key every durable operation and settlement row is written under. Managed
 * turns are keyed by their billing idempotency key; free-trial turns by the
 * request id their reservation row is keyed by -- the same key
 * `buildManagedAgentStream` records inline usage under for a free turn.
 */
export function cloudAgentWorkflowBillingKey(billing: CloudAgentWorkflowBilling): string {
  return billing.kind === 'managed' ? billing.idempotencyKey : billing.requestId;
}

/**
 * Put the live reservation back on the serialized request, on the side the
 * discriminant says it came from.
 *
 * This is the single point that decides which budget the tool loop enforces:
 * `processed.freeTrial` drives the free-tier output cap, `processed.managedUsage`
 * drives the managed per-step reservation. Setting the wrong one -- as the
 * previous unconditional `managedUsage: { db, ...input.billing }` did for any
 * non-managed billing -- makes a free turn unmetered.
 */
export function rehydrateCloudAgentWorkflowRequest(
  input: CloudAgentWorkflowInput,
  db: DatabaseAdapter,
): ProcessedRequest {
  const processed = { ...input.processed } as ProcessedRequest;
  if (input.billing.kind === 'managed') {
    const { kind: _kind, ...reservation } = input.billing;
    return { ...processed, managedUsage: { db, ...reservation } };
  }
  return { ...processed, freeTrial: { ...input.billing } };
}

function serializeBilling(processed: ProcessedRequest): CloudAgentWorkflowBilling {
  if (processed.managedUsage) {
    const { db: _db, ...reservation } = processed.managedUsage;
    return { kind: 'managed', ...reservation };
  }
  if (processed.freeTrial) return { ...processed.freeTrial };
  throw new CloudAgentWorkflowBillingUnavailableError();
}

export function buildCloudAgentWorkflowInput(input: {
  runId: string;
  userId: string;
  processed: ProcessedRequest;
  mcpTools: WebMcpToolDef[];
  approvalMode: ApprovalMode;
  toolApprovalPolicy?: ToolApprovalPolicy;
  connectorPermissions?: ConnectorToolPermissions;
  continuation?: CloudAgentWorkflowInput['continuation'];
  predecessorApproval?: CloudAgentWorkflowInput['predecessorApproval'];
}): CloudAgentWorkflowInput {
  const billing = serializeBilling(input.processed);

  const { managedUsage: _managedUsage, freeTrial: _freeTrial, ...processed } = input.processed;
  const candidate = {
    version: 1 as const,
    runId: input.runId,
    userId: input.userId,
    processed,
    billing,
    mcpTools: input.mcpTools,
    approvalMode: input.approvalMode,
    toolApprovalPolicy: input.toolApprovalPolicy,
    connectorPermissions: input.connectorPermissions?.entries,
    continuation: input.continuation,
    predecessorApproval: input.predecessorApproval,
  };

  return parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(candidate)));
}
