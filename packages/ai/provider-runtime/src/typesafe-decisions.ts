import { TypeSafeClient, type Questions } from '@typesafe-ai/sdk';
import type { DecisionAnswer, DecisionProvider } from '@agiworkforce/agent-core';
import { traceHeaders, withProviderSpan } from './tracing';

export function createTypeSafeDecisionProvider(config: {
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  fetch?: typeof globalThis.fetch;
}): DecisionProvider {
  if (!Number.isSafeInteger(config.maxRetries) || config.maxRetries < 0)
    throw new Error('Invalid decision retry budget');
  const client = new TypeSafeClient({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultModel: config.model,
    timeout: config.timeoutMs,
    retry: { maxRetries: config.maxRetries },
    logLevel: 'off',
    fetch: config.fetch,
  });
  return {
    async evaluate(request, signal) {
      const questions: Questions = Object.fromEntries(
        Object.entries(request.questions).map(([id, q]) => [
          id,
          q.kind === 'boolean'
            ? { type: 'noul', instructions: q.instruction }
            : q.kind === 'choice'
              ? { type: 'choice', instructions: q.instruction, criteria: q.options }
              : {
                  type: 'score',
                  instructions: q.instruction,
                  criteria: q.levels as [string, string, ...string[]],
                },
        ]),
      );
      const response = await withProviderSpan(
        {
          providerId: 'typesafe',
          operation: 'system_one',
          model: config.model,
          attributes: { questionCount: Object.keys(questions).length },
        },
        () =>
          client.systemOne(
            { state: request.state, questions, model: config.model },
            { signal, headers: traceHeaders() },
          ),
      );
      const answers: Record<string, DecisionAnswer> = Object.fromEntries(
        Object.entries(response.answers).map(([id, a]) => [
          id,
          a.type === 'noul'
            ? { kind: 'boolean', probability: a.noul }
            : a.type === 'choice'
              ? {
                  kind: 'choice',
                  value: a.choice,
                  confidence: a.confidence,
                  probabilities: a.probabilities,
                }
              : {
                  kind: 'score',
                  value: a.score,
                  confidence: a.confidence,
                  probabilities: a.probabilities,
                },
        ]),
      );
      return {
        model: response.model,
        answers,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}
