
import { vi, type Mock } from 'vitest';

export const SELECTED_ROUTE = {
  status: 'selected' as const,
  requestedSelection: 'auto',
  requestedProfile: null,
  effectiveProfile: 'balanced',
  taskType: 'simple_chat',
  modelKey: 'test.model',
  provider: 'anthropic',
  providerModelId: 'test-provider-model-id',
  routeId: 'test-route',
  harnessId: 'test/chat',
  fallbacks: [],
  reason: 'preferred_slot',
};

interface ModelMocks {
  resolveAutoRoute: Mock;
  buildServerProviderAdapter: Mock;
  drainToLlmResponse: Mock;
  streamedRequests: unknown[];
}

export const modelMocks: ModelMocks = {
  resolveAutoRoute: vi.fn(),
  buildServerProviderAdapter: vi.fn(),
  drainToLlmResponse: vi.fn(),
  streamedRequests: [],
};

let nextModelText = '{"answer":"","citedChunkIds":[],"abstain":true,"abstainReason":"none"}';

export function queueModelJson(payload: unknown): void {
  nextModelText = JSON.stringify(payload);
}

export function queueModelRawText(text: string): void {
  nextModelText = text;
}

export function armModelMocks(): void {
  process.env['SUPPORT_AGENT_ENABLED'] = '1';
  modelMocks.streamedRequests.length = 0;
  nextModelText = '{"answer":"","citedChunkIds":[],"abstain":true,"abstainReason":"none"}';

  modelMocks.resolveAutoRoute.mockReturnValue(SELECTED_ROUTE);
  modelMocks.buildServerProviderAdapter.mockImplementation(() => ({
    stream: (request: unknown) => {
      modelMocks.streamedRequests.push(request);
      return (async function* () {})();
    },
  }));
  modelMocks.drainToLlmResponse.mockImplementation(async () => ({
    model: 'test.model',
    content: nextModelText,
    promptTokens: 10,
    completionTokens: 10,
    totalTokens: 20,
  }));
}

export function lastUserPrompt(): string {
  const request = modelMocks.streamedRequests.at(-1) as
    | { messages?: { role?: string; content?: unknown }[] }
    | undefined;
  const message = request?.messages?.find((entry) => entry.role === 'user');
  const content = message?.content;
  return typeof content === 'string' ? content : JSON.stringify(content ?? '');
}
