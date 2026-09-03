import { describe, expect, it } from 'vitest';

import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import {
  buildCloudAgentWorkflowInput,
  cloudAgentWorkflowBillingKey,
  CloudAgentWorkflowBillingUnavailableError,
  parseCloudAgentWorkflowInput,
  rehydrateCloudAgentWorkflowRequest,
  type SerializedManagedUsageReservation,
} from './cloud-agent-workflow-input';
import { connectorToolPermissionsFromEntries } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

function makeProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
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
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'inspect the repository' }],
      stream: true,
      work_mode: 'agiwork',
      web_search: true,
      web_fetch: true,
      code_execution: true,
    },
    conversationId: '0190a000-0000-7000-8000-000000000003',
    autoMemoryFacts: ['User prefers concise answers'],
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 12,
    estimatedPromptTokens: 100,
    maxTokens: 4096,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
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
      model: 'fixture-model',
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
      kind: 'managed',
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.request-1',
      requestHash: 'request-hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
    });
    expect(parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('accepts every field the managed usage service puts on a reservation', () => {
    const processed = makeProcessed();
    const full: Required<SerializedManagedUsageReservation> = {
      kind: 'managed',
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.request-1',
      requestHash: 'request-hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000002',
      estimatedCostCents: 12,
      provider: 'openai',
      model: 'fixture-model',
      quotaFeature: 'chat',
      routeId: 'openai/fixture-model',
    };
    const { kind: _kind, ...reservation } = full;
    processed.managedUsage = { ...processed.managedUsage!, ...reservation };

    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed,
      mcpTools: tools,
      approvalMode: 'manual',
    });

    expect(input.billing).toEqual(full);
    expect(parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('accepts the server label the connector tool catalog puts on every connector tool', () => {
    const labelled: WebMcpToolDef[] = [{ ...tools[0]!, serverLabel: 'GitHub' }];

    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed: makeProcessed(),
      mcpTools: labelled,
      approvalMode: 'manual',
    });

    expect(input.mcpTools).toEqual(labelled);
    expect(parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('carries the saved connector verdicts so the durable loop enforces them too', () => {
    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed: makeProcessed(),
      mcpTools: tools,
      approvalMode: 'manual',
      connectorPermissions: connectorToolPermissionsFromEntries([
        { connectorId: 'github', toolName: 'delete_repository', level: 'deny' },
        { connectorId: 'github', toolName: 'get_pull_request', level: 'allow' },
      ]),
    });

    expect(input.connectorPermissions).toEqual([
      { connectorId: 'github', toolName: 'delete_repository', level: 'deny' },
      { connectorId: 'github', toolName: 'get_pull_request', level: 'allow' },
    ]);
    const restored = connectorToolPermissionsFromEntries(
      parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input))).connectorPermissions ?? [],
    );
    expect(restored.isConnectorToolDenied('github', 'delete_repository')).toBe(true);
    expect(restored.levelForConnectorTool('github', 'get_pull_request')).toBe('allow');
  });

  // AGI-126: a free-trial turn used to be refused here, which is what kept the
  // DEFAULT tier off the durable transport entirely.
  it('carries a free-trial reservation across the invocation boundary', () => {
    const processed = makeProcessed();
    delete processed.managedUsage;
    processed.freeTrial = {
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'agi-work-request-1',
      reservedMicrousd: 4_200,
    };

    const input = buildCloudAgentWorkflowInput({
      runId: RUN_ID,
      userId: 'user-1',
      processed,
      mcpTools: tools,
      approvalMode: 'manual',
    });

    expect(input.billing).toEqual({
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'agi-work-request-1',
      reservedMicrousd: 4_200,
    });
    expect(input.processed).not.toHaveProperty('freeTrial');
    expect(input.processed).not.toHaveProperty('managedUsage');
    expect(parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input)))).toEqual(input);
  });

  it('rejects a workflow launch that carries no reservation at all', () => {
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
    ).toThrow(CloudAgentWorkflowBillingUnavailableError);
  });

  it('refuses a reservation the workflow user does not own, on either tier', () => {
    const managed = makeProcessed();
    expect(() =>
      buildCloudAgentWorkflowInput({
        runId: RUN_ID,
        userId: 'attacker',
        processed: managed,
        mcpTools: [],
        approvalMode: 'auto',
      }),
    ).toThrow(/does not own the billing reservation/i);

    const free = makeProcessed();
    delete free.managedUsage;
    free.freeTrial = {
      kind: 'free_trial',
      userId: 'user-1',
      requestId: 'agi-work-request-1',
      reservedMicrousd: 10,
    };
    expect(() =>
      buildCloudAgentWorkflowInput({
        runId: RUN_ID,
        userId: 'attacker',
        processed: free,
        mcpTools: [],
        approvalMode: 'auto',
      }),
    ).toThrow(/does not own the billing reservation/i);
  });

  describe('rehydration decides which budget the tool loop enforces', () => {
    it('puts a managed reservation back on processed.managedUsage only', () => {
      const input = buildCloudAgentWorkflowInput({
        runId: RUN_ID,
        userId: 'user-1',
        processed: makeProcessed(),
        mcpTools: [],
        approvalMode: 'auto',
      });
      const db = {} as never;

      const rehydrated = rehydrateCloudAgentWorkflowRequest(input, db);

      expect(rehydrated.managedUsage).toMatchObject({
        db,
        userId: 'user-1',
        idempotencyKey: 'agi.chat.web.request-1',
      });
      expect(rehydrated.managedUsage).not.toHaveProperty('kind');
      expect(rehydrated.freeTrial).toBeUndefined();
      expect(cloudAgentWorkflowBillingKey(input.billing)).toBe('agi.chat.web.request-1');
    });

    // The metering proof for AGI-126. `tool-loop.ts` reads `processed.freeTrial`
    // to apply the free output-budget cap and `processed.managedUsage` to reserve
    // per provider step. Rehydrating a free reservation onto `managedUsage` — as
    // the unconditional `{ db, ...input.billing }` spread did — makes a durable
    // free turn skip the free cap entirely: durable AND unmetered.
    it('puts a free-trial reservation back on processed.freeTrial only', () => {
      const processed = makeProcessed();
      delete processed.managedUsage;
      processed.freeTrial = {
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'agi-work-request-1',
        reservedMicrousd: 4_200,
      };
      const input = buildCloudAgentWorkflowInput({
        runId: RUN_ID,
        userId: 'user-1',
        processed,
        mcpTools: [],
        approvalMode: 'auto',
      });

      const rehydrated = rehydrateCloudAgentWorkflowRequest(input, {} as never);

      expect(rehydrated.freeTrial).toEqual({
        kind: 'free_trial',
        userId: 'user-1',
        requestId: 'agi-work-request-1',
        reservedMicrousd: 4_200,
      });
      expect(rehydrated.managedUsage).toBeUndefined();
      expect(cloudAgentWorkflowBillingKey(input.billing)).toBe('agi-work-request-1');
    });
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
