import {
  ALLOWED_MANAGED_PROVIDER_HOSTS,
  resolveValidatedBaseUrl,
} from '@agiworkforce/provider-runtime';

import { VERCEL_GATEWAY_DEFAULT_BASE_URL } from './endpoint';

export interface EvaluationChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Readonly<Record<string, string>>;
}

export interface EvaluationBooleanQuestion {
  type: 'boolean';
  instructions: string;
  criteria?: { readonly true: string; readonly false: string };
}

export interface EvaluationScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: readonly string[];
}

export type EvaluationQuestion =
  EvaluationChoiceQuestion | EvaluationBooleanQuestion | EvaluationScoreQuestion;

export type EvaluationQuestions = Readonly<Record<string, EvaluationQuestion>>;

export interface VercelGatewayEvaluationRequest {
  model: string;
  state: unknown;
  questions: EvaluationQuestions;
  providerOptions?: {
    gateway?: {
      only?: readonly string[];
      zeroDataRetention?: boolean;
    };
  };
  signal?: AbortSignal;
}

export type EvaluationAnswer =
  | { type: 'boolean'; probability: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number> }
  | { type: 'score'; score: number; probabilities: Record<string, number> };

export interface VercelGatewayEvaluationResult {
  model: string;
  answers: Record<string, EvaluationAnswer>;
  usage: { inputTokens: number; outputTokens: number };
  resolvedProvider: string | null;
  generationId: string | null;
  providerCostMicrousd: number | null;
}

export interface VercelGatewayEvaluationConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export class VercelGatewayEvaluationError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: 'http_error' | 'invalid_response',
  ) {
    super(message);
    this.name = 'VercelGatewayEvaluationError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function probability(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function probabilities(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): Record<string, number> | null {
  const source = record(value);
  if (!source || Object.keys(source).length !== allowedKeys.size) return null;
  const output: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    const parsed = probability(entry);
    if (!allowedKeys.has(key) || parsed === null) return null;
    output[key] = parsed;
  }
  const total = Object.values(output).reduce((sum, entry) => sum + entry, 0);
  if (Math.abs(total - 1) > 0.02) return null;
  return output;
}

function parseAnswer(question: EvaluationQuestion, value: unknown): EvaluationAnswer | null {
  const answer = record(value);
  if (!answer || answer['type'] !== question.type) return null;
  if (question.type === 'boolean') {
    const parsed = probability(answer['probability']);
    return parsed === null ? null : { type: 'boolean', probability: parsed };
  }
  if (question.type === 'choice') {
    const choice = answer['choice'];
    const allowed = new Set(Object.keys(question.criteria));
    const parsed = probabilities(answer['probabilities'], allowed);
    if (typeof choice !== 'string' || !allowed.has(choice) || !parsed) return null;
    if (parsed[choice]! + Number.EPSILON < Math.max(...Object.values(parsed))) return null;
    return { type: 'choice', choice, probabilities: parsed };
  }
  const score = answer['score'];
  const allowed = new Set(question.criteria.map((_, index) => String(index)));
  const parsed = probabilities(answer['probabilities'], allowed);
  return typeof score !== 'number' ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > question.criteria.length - 1 ||
    !parsed
    ? null
    : { type: 'score', score, probabilities: parsed };
}

function decimalUsdToMicrousd(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 1_000_000)) : null;
}

function parseResponse(
  value: unknown,
  questions: EvaluationQuestions,
): VercelGatewayEvaluationResult {
  const response = record(value);
  const model = boundedText(response?.['model'], 256);
  const rawAnswers = record(response?.['answers']);
  const usage = record(response?.['usage']);
  if (!model || !rawAnswers || !usage) {
    throw new VercelGatewayEvaluationError(
      'The evaluation provider returned an invalid response',
      null,
      'invalid_response',
    );
  }
  const expectedKeys = Object.keys(questions).sort();
  if (JSON.stringify(Object.keys(rawAnswers).sort()) !== JSON.stringify(expectedKeys)) {
    throw new VercelGatewayEvaluationError(
      'The evaluation provider returned an invalid response',
      null,
      'invalid_response',
    );
  }
  const answers: Record<string, EvaluationAnswer> = {};
  for (const key of expectedKeys) {
    const parsed = parseAnswer(questions[key]!, rawAnswers[key]);
    if (!parsed) {
      throw new VercelGatewayEvaluationError(
        'The evaluation provider returned an invalid response',
        null,
        'invalid_response',
      );
    }
    answers[key] = parsed;
  }
  const inputTokens = nonNegativeInteger(usage['inputTokens']);
  const outputTokens = nonNegativeInteger(usage['outputTokens']);
  if (inputTokens === null || outputTokens === null) {
    throw new VercelGatewayEvaluationError(
      'The evaluation provider returned an invalid response',
      null,
      'invalid_response',
    );
  }
  const gateway = record(record(response?.['providerMetadata'])?.['gateway']);
  const routing = record(gateway?.['routing']);
  const resolvedProvider = boundedText(routing?.['resolvedProvider'], 128);
  const generationId = boundedText(gateway?.['generationId'], 256);
  return {
    model,
    answers,
    usage: { inputTokens, outputTokens },
    resolvedProvider,
    generationId,
    providerCostMicrousd: decimalUsdToMicrousd(gateway?.['cost']),
  };
}

export function createVercelGatewayEvaluator(config: VercelGatewayEvaluationConfig) {
  const { url: baseUrl } = resolveValidatedBaseUrl(
    config.baseUrl,
    VERCEL_GATEWAY_DEFAULT_BASE_URL,
    { allowedHosts: new Set(ALLOWED_MANAGED_PROVIDER_HOSTS) },
  );
  const fetcher = config.fetch ?? globalThis.fetch;
  return {
    async evaluate(
      request: VercelGatewayEvaluationRequest,
    ): Promise<VercelGatewayEvaluationResult> {
      const response = await fetcher(`${baseUrl}/evaluate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          state: request.state,
          questions: request.questions,
          ...(request.providerOptions ? { providerOptions: request.providerOptions } : {}),
        }),
        signal: request.signal,
      });
      if (!response.ok) {
        throw new VercelGatewayEvaluationError(
          `The evaluation provider returned HTTP ${response.status}`,
          response.status,
          'http_error',
        );
      }
      let payload: unknown;
      try {
        const responseText = await response.text();
        if (responseText.length > 262_144) throw new Error('oversized response');
        payload = JSON.parse(responseText);
      } catch {
        throw new VercelGatewayEvaluationError(
          'The evaluation provider returned invalid JSON',
          response.status,
          'invalid_response',
        );
      }
      return parseResponse(payload, request.questions);
    },
  };
}
