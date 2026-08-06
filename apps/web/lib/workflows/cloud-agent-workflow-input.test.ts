import { describe, expect, it } from 'vitest';

import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  buildCloudAgentWorkflowInput,
  parseCloudAgentWorkflowInput,
} from './cloud-agent-workflow-input';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'agi-work-request-1',
    managedUsage: {
      db: {} as ProcessedRequest['managedUsage'] extends infer T
        ? T extends { db: infer D }
          ? D
          : never
        : never,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.request-1',
      requestHash: 'request-hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    },
    chatRequest: {
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user', content: 'inspect the repository' }],
      stream: true,
      work_mode: 'agiwork',
      web_search: true,
      web_fetch: true,
      code_execution: true,
    },
    conversationId: '0190a000-0000-7000-8000-000000000003',
    autoMemoryFacts: ['User prefers concise answers'],
    requestedModel: 'gpt-5.6-sol',
    provider: 'openai',
    estimatedCostCents: 12,
    estimatedPromptTokens: 100,
    maxTokens: 4096,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'gpt-5.6-sol',
    fallbackModels: [],
    subscriptionTier: 'max',
    resolvedTaskType: 'coding',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: true,
    indicResult: {
      isIndic: false,
      indicRatio: 0,
      indicCharCount: 0,
      totalCharCount: 10,
      dominantScript: null,
      scriptCounts: {
        devanagari: 0,
        bengali: 0,
        gurmukhi: 0,
        gujarati: 0,
        tamil: 0,
        telugu: 0,
        kannada: 0,
        malayalam: 0,
      },
    },
    llmRequest: {
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user', content: 'inspect the repository' }],
      max_tokens: 4096,
      stream: true,
    },
  };
}

const tools: WebMcpToolDef[] = [
  {
    qualifiedName: 'mcp__github__get_pull_request',
    serverId: 'github',
    toolName: 'get_pull_request',
    description: 'Read a pull request',
    origin: 'connector',
    inputSchema: { type: 'object', properties: { number: { type: 'number' } } },
  },
];

describe('cloud agent workflow input', () => {
  it('removes live database handles and round-trips trusted execution state', () => {
    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed: makeProcessed(),
      mcpTools: tools,
      approvalMode: 'manual',
    });

    expect(input.processed).not.toHaveProperty('managedUsage');
    expect(input.processed).not.toHaveProperty('freeTrial');
    expect(input.processed.autoMemoryFacts).toEqual(['User prefers concise answers']);
    expect(input.billing).toEqual({
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.request-1',
      requestHash: 'request-hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    });
    expect(parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('rejects a workflow launch without a managed usage reservation', () => {
    const processed = makeProcessed();
    delete processed.managedUsage;

    expect(() =>
      buildCloudAgentWorkflowInput({
        runId: RUN_ID,
        userId: 'user-1',
        processed,
        mcpTools: [],
        approvalMode: 'auto',
      }),
    ).toThrow(/managed usage reservation/i);
  });

  it.each([
    ['an ordinary tool-using chat turn', 'chat' as const],
    ['a plain OpenAI-compatible caller with no work mode', undefined],
  ])('admits %s now that durability is not AGI Work-only', (_label, workMode) => {
    const processed = makeProcessed();
    processed.chatRequest.work_mode = workMode;

    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed,
      mcpTools: [],
      approvalMode: 'auto',
    });

    expect(input.processed.chatRequest.work_mode).toBe(workMode);
  });

  it('round-trips invocation and approval continuation cursors', () => {
    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed: makeProcessed(),
      mcpTools: tools,
      approvalMode: 'manual',
      continuation: {
        eventSessionId: 'session-1',
        eventTurnId: 'turn-1',
        initialEventSequence: 9,
        initialCompletedSteps: 2,
        invocationContinuation: true,
        resume: { approvals: [{ toolCallId: 'call-1', decision: 'approved' }] },
      },
      predecessorApproval: {
        checkpointId: '0190a000-0000-7000-8000-000000000004',
        leaseToken: '0190a000-0000-7000-8000-000000000005',
      },
    });

    expect(parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('keeps approval resumes visible while bounded invocation continuations stay quiet', () => {
    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed: makeProcessed(),
      mcpTools: tools,
      approvalMode: 'manual',
      continuation: {
        eventSessionId: 'session-1',
        eventTurnId: 'turn-1',
        initialEventSequence: 9,
        initialCompletedSteps: 2,
        invocationContinuation: false,
        resume: { approvals: [{ toolCallId: 'call-1', decision: 'approved' }] },
      },
    });

    expect(parseCloudAgentWorkflowInput(input).continuation?.invocationContinuation).toBe(false);
  });
});
