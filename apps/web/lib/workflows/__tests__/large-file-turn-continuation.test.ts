import { describe, expect, it } from 'vitest';

import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import {
  buildCloudAgentWorkflowInput,
  parseCloudAgentWorkflowInput,
  rehydrateCloudAgentWorkflowRequest,
} from '../cloud-agent-workflow-input';
import { workflowContinuation } from '../cloud-agent-workflow-continuation';

const RUN_ID = '0190a000-0000-7000-8000-000000000011';
const LARGE_ID = '11111111-1111-4111-8111-111111111111';

type ManagedDb = NonNullable<ProcessedRequest['managedUsage']>['db'];

function processedTurn(largeFileTurn?: ProcessedRequest['largeFileTurn']): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'large-file-request-1',
    managedUsage: {
      db: {} as ManagedDb,
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.large-file-1',
      requestHash: 'request-hash-1',
      leaseToken: '0190a000-0000-7000-8000-000000000012',
      estimatedCostCents: 12,
    },
    chatRequest: {
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'total the ledger' }],
      stream: true,
      work_mode: 'agiwork',
      code_execution: true,
    },
    conversationId: '0190a000-0000-7000-8000-000000000013',
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 12,
    estimatedPromptTokens: 100,
    maxTokens: 4096,
    usedFallback: false,
    originalModel: 'fixture-model',
    fallbackModels: [],
    subscriptionTier: 'max',
    resolvedTaskType: 'analysis',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat',
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: {
      isIndic: false,
      indicRatio: 0,
      indicCharCount: 0,
      totalCharCount: 16,
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
      messages: [{ role: 'user', content: 'total the ledger' }],
      max_tokens: 4096,
      stream: true,
    },
    ...(largeFileTurn ? { largeFileTurn } : {}),
  } as unknown as ProcessedRequest;
}

function continueFrom(serving: ProcessedRequest) {
  const input = buildCloudAgentWorkflowInput({
    runId: RUN_ID,
    userId: 'user-1',
    processed: processedTurn(),
    mcpTools: [],
    approvalMode: 'auto',
  });
  return workflowContinuation(
    parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(input))),
    serving,
    {
      sessionId: 'session-1',
      turnId: 'turn-1',
      nextEventSequence: 7,
      completedSteps: 30,
      messages: [{ role: 'user', content: 'total the ledger' }],
    },
  );
}

describe('large-file ledger across a wall-clock continuation', () => {
  it('a continuation carries largeFileTurn through parseCloudAgentWorkflowInput', () => {
    const ledger = {
      assetIds: [LARGE_ID],
      attachmentAssetIds: [LARGE_ID],
      limitTokens: 120_000,
      charged: 81_250,
      readingClosed: true,
      fileToolsOffered: true,
    };

    const next = continueFrom(processedTurn(ledger));
    const restored = parseCloudAgentWorkflowInput(JSON.parse(JSON.stringify(next)));

    expect(next.processed.largeFileTurn).toEqual(ledger);
    expect(restored.processed.largeFileTurn).toEqual(ledger);
    expect(rehydrateCloudAgentWorkflowRequest(restored, {} as ManagedDb).largeFileTurn).toEqual(
      ledger,
    );
  });

  it('a turn with no large file continues with no ledger', () => {
    const next = continueFrom(processedTurn());

    expect(next.processed).not.toHaveProperty('largeFileTurn');
  });
});
