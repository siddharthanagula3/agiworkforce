export type DecisionQuestion =
  | { kind: 'boolean'; instruction: string }
  | { kind: 'choice'; instruction: string; options: Record<string, string> }
  | { kind: 'score'; instruction: string; levels: string[] };

export type DecisionAnswer =
  | { kind: 'boolean'; probability: number }
  | { kind: 'choice'; value: string; confidence: number; probabilities: Record<string, number> }
  | { kind: 'score'; value: number; confidence: number; probabilities: Record<string, number> };

export interface DecisionRequest {
  state: string;
  questions: Record<string, DecisionQuestion>;
}

export interface DecisionResult {
  model: string;
  answers: Record<string, DecisionAnswer>;
  inputTokens: number;
  outputTokens: number;
}

export interface DecisionProvider {
  evaluate(request: DecisionRequest, signal: AbortSignal): Promise<unknown>;
}

export interface DecisionPolicy {
  mode: 'disabled' | 'shadow' | 'enabled';
  model: string;
  timeoutMs: number;
  maxRequestBytes: number;
  maxQuestions: number;
  maxConcurrent: number;
  sampleRate: number;
}

export interface DecisionScope {
  trustMode: 'local' | 'byok' | 'managed_cloud';
  providerAllowed: boolean;
  cohort: number;
  signal?: AbortSignal;
}

export type DecisionFallbackReason =
  | 'disabled'
  | 'policy'
  | 'sampled_out'
  | 'invalid_request'
  | 'capacity'
  | 'aborted'
  | 'timeout'
  | 'provider_error'
  | 'invalid_response'
  | 'policy_changed';

export type DecisionOutcome =
  | { status: 'accepted' | 'shadow'; result: DecisionResult; latencyMs: number }
  | { status: 'fallback'; reason: DecisionFallbackReason; latencyMs: number };

export interface DecisionObservation {
  status: DecisionOutcome['status'];
  reason?: DecisionFallbackReason;
  latencyMs: number;
  questionCount: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

// The provider rounds each probability and score to two decimals independently.
const ROUNDING_ERROR = 0.005;

function distribution(value: unknown, keys: string[]): value is Record<string, number> {
  return (
    record(value) &&
    sameKeys(value, keys) &&
    Object.values(value).every(probability) &&
    Math.abs(Object.values(value).reduce<number>((sum, p) => sum + (p as number), 0) - 1) <=
      ROUNDING_ERROR * keys.length + Number.EPSILON
  );
}

export function isDecisionResult(
  value: unknown,
  request: DecisionRequest,
  model: string,
): value is DecisionResult {
  if (!record(value) || value['model'] !== model || !record(value['answers'])) return false;
  if (
    !['inputTokens', 'outputTokens'].every(
      (key) => Number.isSafeInteger(value[key]) && (value[key] as number) >= 0,
    )
  )
    return false;
  const answers = value['answers'];
  if (!sameKeys(answers, Object.keys(request.questions))) return false;
  return Object.entries(request.questions).every(([key, question]) => {
    const answer = answers[key];
    if (!record(answer) || answer['kind'] !== question.kind) return false;
    if (question.kind === 'boolean') return probability(answer['probability']);
    if (!probability(answer['confidence'])) return false;
    const keys =
      question.kind === 'choice'
        ? Object.keys(question.options)
        : question.levels.map((_, i) => String(i));
    const probabilities = answer['probabilities'];
    if (!distribution(probabilities, keys)) return false;
    if (question.kind === 'choice') {
      const selected = answer['value'];
      return (
        typeof selected === 'string' &&
        keys.includes(selected) &&
        probabilities[selected]! >= Math.max(...Object.values(probabilities)) - 0.001
      );
    }
    const score = answer['value'];
    const expected = keys.reduce((sum, key) => sum + Number(key) * probabilities[key]!, 0);
    return (
      typeof score === 'number' &&
      Number.isFinite(score) &&
      score >= 0 &&
      score <= question.levels.length - 1 &&
      Math.abs(score - expected) <=
        ROUNDING_ERROR * (1 + keys.reduce((sum, key) => sum + Number(key), 0)) + Number.EPSILON
    );
  });
}

function validRequest(request: DecisionRequest, policy: DecisionPolicy): boolean {
  const questions = Object.values(request.questions);
  return (
    request.state.trim().length > 0 &&
    questions.length > 0 &&
    questions.length <= policy.maxQuestions &&
    new TextEncoder().encode(JSON.stringify(request)).length <= policy.maxRequestBytes &&
    questions.every(
      (q) =>
        q.instruction.trim().length > 0 &&
        (q.kind === 'boolean' ||
          (q.kind === 'choice' &&
            Object.keys(q.options).length >= 2 &&
            Object.keys(q.options).length <= 255) ||
          (q.kind === 'score' && q.levels.length >= 2 && q.levels.length <= 10)),
    )
  );
}

function validPolicy(policy: DecisionPolicy): boolean {
  return (
    ['disabled', 'shadow', 'enabled'].includes(policy.mode) &&
    policy.model.trim().length > 0 &&
    [policy.timeoutMs, policy.maxRequestBytes, policy.maxQuestions, policy.maxConcurrent].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) &&
    probability(policy.sampleRate)
  );
}

export function createDecisionEvaluator(options: {
  provider: DecisionProvider;
  policy: () => DecisionPolicy;
  observe?: (event: DecisionObservation) => void;
}) {
  let active = 0;
  return async (request: DecisionRequest, scope: DecisionScope): Promise<DecisionOutcome> => {
    const started = performance.now();
    const finish = (outcome: DecisionOutcome): DecisionOutcome => {
      try {
        options.observe?.({
          status: outcome.status,
          latencyMs: outcome.latencyMs,
          questionCount: Object.keys(request.questions).length,
          ...(outcome.status === 'fallback'
            ? { reason: outcome.reason }
            : {
                model: outcome.result.model,
                inputTokens: outcome.result.inputTokens,
                outputTokens: outcome.result.outputTokens,
              }),
        });
      } catch {
        /* Telemetry must not affect the primary request. */
      }
      return outcome;
    };
    const fallback = (reason: DecisionFallbackReason) =>
      finish({ status: 'fallback', reason, latencyMs: performance.now() - started });
    let policy: DecisionPolicy;
    try {
      policy = { ...options.policy() };
      if (!validPolicy(policy)) return fallback('policy');
    } catch {
      return fallback('policy');
    }
    if (policy.mode === 'disabled') return fallback('disabled');
    if (scope.trustMode !== 'managed_cloud' || scope.providerAllowed !== true)
      return fallback('policy');
    if (!probability(scope.cohort) || scope.cohort >= policy.sampleRate)
      return fallback('sampled_out');
    if (scope.signal?.aborted) return fallback('aborted');
    try {
      if (!validRequest(request, policy)) return fallback('invalid_request');
    } catch {
      return fallback('invalid_request');
    }
    if (active >= policy.maxConcurrent) return fallback('capacity');
    active += 1;
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => {
          controller.abort();
          reject(new Error('aborted'));
        };
        scope.signal?.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => {
          timedOut = true;
          abort!();
        }, policy.timeoutMs);
      });
      // Hold the capacity slot until the transport settles, even if it ignores cancellation.
      const pending = Promise.resolve().then(() =>
        options.provider.evaluate(request, controller.signal),
      );
      void pending.then(
        () => {
          active -= 1;
        },
        () => {
          active -= 1;
        },
      );
      const result = await Promise.race([pending, interrupted]);
      if (scope.signal?.aborted) return fallback('aborted');
      if (!isDecisionResult(result, request, policy.model)) return fallback('invalid_response');
      if (JSON.stringify(options.policy()) !== JSON.stringify(policy))
        return fallback('policy_changed');
      return finish({
        status: policy.mode === 'shadow' ? 'shadow' : 'accepted',
        result,
        latencyMs: performance.now() - started,
      });
    } catch {
      return fallback(timedOut ? 'timeout' : scope.signal?.aborted ? 'aborted' : 'provider_error');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abort) scope.signal?.removeEventListener('abort', abort);
    }
  };
}
