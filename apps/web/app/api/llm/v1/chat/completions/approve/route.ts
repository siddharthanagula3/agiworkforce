import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { handleCorsPreflightRequest, getSecurityHeaders, getCorsHeaders } from '@/lib/cors';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { runAuthGate } from '../lib/auth-gate';
import { processRequest } from '../lib/request-processor';
import { runToolLoop, loadMcpToolDefs, type ToolApprovalDecision } from '../lib/tool-loop';
import { buildManagedAgentStream } from '../lib/managed-agent-stream';
import { loadUserConnectorToolDefs, makeUserConnectorExecutor } from '@/lib/user-connector-tools';
import { createObservedProviderUsage } from '@/lib/services/managed-usage-accounting-service';
import {
  ManagedUsageRequestError,
  finalizeManagedUsageRequest,
  markManagedUsageProviderStarted,
} from '@/lib/services/managed-usage-request-service';

/**
 * Tool-approval RESUME endpoint for the agentic chat loop.
 *
 * Endpoint: POST /api/llm/v1/chat/completions/approve (internal — NOT part of the
 * public `/v1/chat/completions` rewrite in apps/web/vercel.json, so the byte-stable
 * public v1 wire is untouched).
 *
 * Manual-approval flow (see lib/tool-loop.ts):
 *   1. A streaming chat request with MCP-class tools runs in `manual` mode. When
 *      the model requests a tool, the loop emits `x_tool_approval_request` events
 *      for each pending tool_call and RETURNS (stateless suspend — no server-side
 *      loop state is persisted).
 *   2. The client renders an approve/reject card per tool, then POSTs HERE with:
 *        - the FULL conversation thread INCLUDING the suspended assistant
 *          tool_call turn as the last assistant message (standard OpenAI
 *          continue-after-tool shape), and
 *        - `tool_approvals: [{ tool_call_id, decision }]` — one decision per
 *          pending tool_call.
 *   3. This route re-runs the SAME auth + managed-compute gate + processRequest
 *      (credit reservation, model resolution) as the main route, re-loads the
 *      per-request tool catalog (operator MCP + the user's connected connectors),
 *      and drives runToolLoop with `options.resume`. The loop executes ONLY
 *      approved calls whose tool_call_id matches a pending call (re-running every
 *      guard: connector re-gate, SSRF, catalog membership) and appends a denial
 *      tool result for rejected/undecided ones, then continues to a final answer.
 *
 * SECURITY (fail-closed, per-tool, server-verified):
 *   - A tool executes ONLY when the resume carries an explicit `approved` decision
 *     for a tool_call_id that is ACTUALLY PENDING in the replayed assistant turn.
 *     Any approval referencing a non-pending id is rejected here (400) before any
 *     stream starts — executes nothing.
 *   - All the runtime guards from the initial request are re-run on the resumed
 *     execution (they live inside runMcpTool / the connector executor / the MCP
 *     dispatcher — nothing is trusted from the client beyond the decision).
 *   - The authenticated Clerk userId binds both the connector executor and the
 *     credit reservation; the resume is scoped to that user exactly like the
 *     initial request.
 */

const toolApprovalSchema = z.object({
  tool_call_id: z.string().min(1).max(128),
  decision: z.enum(['approved', 'rejected']),
});

const resumeBodySchema = z.object({
  tool_approvals: z.array(toolApprovalSchema).min(1).max(32),
  messages: z
    .array(
      z.object({
        role: z.string(),
        tool_calls: z.array(z.object({ id: z.string().optional() }).passthrough()).optional(),
      }),
    )
    .optional(),
});

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { message, type: 'invalid_request_error', code: 'tool_approval_invalid' } },
    { status, headers: getSecurityHeaders() },
  );
}

/**
 * Collect the tool_call ids of the LAST assistant message that carries tool_calls
 * (the suspended turn) from the replayed thread. Returns an empty set when the
 * thread has no such message.
 */
function pendingIdsFromMessages(messages: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(messages)) return ids;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    if (o['role'] !== 'assistant') continue;
    const tcs = o['tool_calls'];
    if (!Array.isArray(tcs) || tcs.length === 0) continue;
    for (const tc of tcs) {
      if (tc && typeof tc === 'object') {
        const id = (tc as Record<string, unknown>)['id'];
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
    return ids; // stop at the first (most recent) assistant tool_call turn
  }
  return ids;
}

async function handleToolApproval(request: NextRequest) {
  // 1. Auth (identical to the main chat route).
  const authResult = await runAuthGate(request);
  if (!authResult.ok) return authResult.response;

  const { userId, token, subscription } = authResult;

  const isFreeTierRequest =
    !subscription || !subscription.plan_tier || subscription.plan_tier.toLowerCase() === 'free';

  const managedGateResponse = buildManagedComputeGateResponse(
    request,
    {
      provider: 'managed',
      model: 'chat-completions',
      feature: 'llm_v1_chat_completions',
      isFreeTrial: isFreeTierRequest,
    },
    getSecurityHeaders(),
  );
  if (managedGateResponse) return managedGateResponse;

  // 2. Parse the resume-specific fields from a CLONE so processRequest can still
  //    read the original body stream itself. `tool_approvals` is stripped by
  //    ChatCompletionRequestSchema (it strips unknown keys), so processRequest
  //    ignores it while we read it here.
  let resumeFields: z.infer<typeof resumeBodySchema>;
  try {
    const raw = await request.clone().json();
    const parsed = resumeBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError('Invalid or missing tool_approvals in resume request.', 400);
    }
    resumeFields = parsed.data;
  } catch {
    return jsonError('Invalid JSON in resume request body.', 400);
  }

  // 3. SECURITY: every approval must reference a tool_call that is actually
  //    pending in the replayed assistant turn. Reject forged / mismatched ids
  //    BEFORE any credit reservation or stream — this path executes nothing.
  const pendingIds = pendingIdsFromMessages(resumeFields.messages);
  if (pendingIds.size === 0) {
    return jsonError('Resume thread has no suspended assistant tool_call turn.', 400);
  }
  for (const approval of resumeFields.tool_approvals) {
    if (!pendingIds.has(approval.tool_call_id)) {
      return jsonError(
        `Approval references tool_call_id "${approval.tool_call_id}" which is not pending.`,
        400,
      );
    }
  }

  // 4. Standard request processing (validates the thread, resolves the model,
  //    reserves credits) — same as the main chat route.
  const processResult = await processRequest(request, authResult);
  if (!processResult.ok) return processResult.response;
  const processed = processResult;

  if (processed.managedUsage) {
    try {
      await markManagedUsageProviderStarted(processed.managedUsage);
    } catch (error) {
      await finalizeManagedUsageRequest({
        ...processed.managedUsage,
        outcome: 'failed',
        actualCostCents: 0,
        usage: { reason: 'provider_start_failed' },
      }).catch(() => undefined);
      const managedError =
        error instanceof ManagedUsageRequestError
          ? error
          : new ManagedUsageRequestError(
              'Managed usage billing is temporarily unavailable.',
              503,
              'billing_unavailable',
            );
      return NextResponse.json(
        {
          error: {
            message: managedError.message,
            type: 'invalid_request_error',
            code: managedError.code,
            contract_version: managedError.contractVersion,
          },
        },
        { status: managedError.status, headers: getSecurityHeaders() },
      );
    }
  }

  // Force extended thinking OFF on the resume continuation. A post-tool answer
  // needs no extended thinking, and a thinking-enabled continuation of an
  // Anthropic tool_use turn would require the SUSPENDED turn's signed thinking
  // block replayed before the tool_use blocks — a server-only signature that
  // cannot cross a stateless resume on the client wire (see
  // TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01 and request-processor's
  // no-thinking-on-wire invariant). Dropping it here lets the continuation
  // COMPLETE (degraded: no thinking on this one turn) instead of the provider
  // rejecting the missing signed block. The web client already omits thinking on
  // resume; this makes the endpoint robust for any caller.
  processed.llmRequest.thinking_mode = undefined;
  processed.llmRequest.thinking = undefined;
  processed.llmRequest.effort = undefined;
  processed.chatRequest.thinking_mode = undefined;
  processed.chatRequest.thinking = undefined;

  // 5. Re-load the per-request tool catalog exactly as the main route does, so
  //    the resume's catalog-membership gate and connector executor match the
  //    tools that were offered on the suspended turn.
  const [operatorTools, connectorTools] = await Promise.all([
    loadMcpToolDefs(),
    loadUserConnectorToolDefs(userId),
  ]);
  const mcpTools = [...operatorTools, ...connectorTools];

  const connectorExecutor =
    connectorTools.length > 0 ? makeUserConnectorExecutor(userId) : undefined;

  const approvals: ToolApprovalDecision[] = resumeFields.tool_approvals.map((a) => ({
    toolCallId: a.tool_call_id,
    decision: a.decision,
  }));

  const toolLoopUsage = createObservedProviderUsage();
  const toolLoopGen = runToolLoop(processed, {
    mcpTools,
    approvalMode: 'manual',
    userId,
    connectorExecutor,
    resume: { approvals },
    usage: toolLoopUsage,
  });

  const agentStream = buildManagedAgentStream({
    generator: toolLoopGen,
    processed,
    usage: toolLoopUsage,
    completionReason: 'tool_resume_completed',
    cancellationReason: 'client_cancelled_tool_resume',
  });

  const streamHeaders: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-AGI-Tool-Loop': 'resume',
    ...getCorsHeaders(request),
    ...getSecurityHeaders(),
  };
  if (processed.quotaWarningHeader) {
    streamHeaders['X-Quota-Warning'] = processed.quotaWarningHeader;
  }

  // `token` is intentionally unused here (no post-stream persistence in the
  // resume path — the client saves the final assistant message, same as the
  // main route's client-side save).
  void token;

  return new NextResponse(agentStream, { headers: streamHeaders });
}

export const POST = withErrorHandler(handleToolApproval);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
