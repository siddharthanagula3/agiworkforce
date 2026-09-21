import 'server-only';

import type { KeyValueStore } from '@agiworkforce/key-value';
import { modelRegistry } from '@agiworkforce/model-registry';
import {
  createVercelGatewayEvaluator,
  type EvaluationAnswer,
  type EvaluationQuestions,
  type VercelGatewayEvaluationResult,
} from '@agiworkforce/providers-vercel-gateway';
import {
  ANSWER_DEPTHS,
  ANSWER_FORMATS,
  type ResponseBudgetPlan,
  type RoutingTaskType,
  type SemanticResponseAssessment,
} from '@agiworkforce/routing';
import { isAutoModeModelId } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import type { PromptId } from '@/lib/prompts/prompt-manifest';
import { resolvePrompt } from '@/lib/prompts/prompt-registry';
import { getKeyValueStore } from '@/lib/server/key-value';
import { recordProviderCostEvent } from '@/lib/services/cogs-ledger-service';
import {
  policyRestrictsAnything,
  type ModelAccessPolicy,
} from '@/lib/services/model-policy-evaluator';
import { resolveServerProviderCredentials } from '@/lib/services/provider-adapter-service';

type AssessmentMode = 'off' | 'shadow' | 'active';
type AssessmentStatus = 'skipped' | 'failed' | 'assessed';

const CONFIG = modelRegistry.policies.auto.semanticResponseAssessment;
const ANSWER_DEPTH_SET = new Set<string>(ANSWER_DEPTHS);
const ANSWER_FORMAT_SET = new Set<string>(ANSWER_FORMATS);
const CLARIFICATION_SET = new Set(['required', 'not_required', 'uncertain']);
const DAY_SECONDS = 48 * 60 * 60;
const completed = new Map<string, Promise<SemanticResponseAssessmentOutcome>>();
let inFlight = 0;

export interface SemanticResponseAssessmentTrace {
  mode: AssessmentMode;
  status: AssessmentStatus;
  reason: string;
  promptStamp: string | null;
  model: string | null;
  accepted: boolean;
  confidence: number | null;
  answerDepth: string | null;
  answerFormat: string | null;
  explanationRequired: boolean | null;
  clarification: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  providerCostMicrousd: number | null;
  durationMs: number | null;
}

export interface SemanticResponseAssessmentOutcome {
  assessment: SemanticResponseAssessment | null;
  trace: SemanticResponseAssessmentTrace;
}

export interface SemanticResponseAssessmentInput {
  requestId: string;
  requestedModel: string;
  surface: string;
  isFreePlan: boolean;
  hasMedia: boolean;
  initialBudget: ResponseBudgetPlan | null;
  zeroDataRetentionOnly: boolean;
  residencyRegion: string | null;
  workspaceModelPolicy: ModelAccessPolicy | null;
  enableResponseAssessment?: boolean;
  applyResponseAssessment?: boolean;
  message: string;
  taskType: RoutingTaskType;
  userId: string;
  organizationId: string | null;
  promptVariants: Readonly<Record<string, number>>;
  signal?: AbortSignal;
}

interface Evaluator {
  evaluate(
    input: Parameters<ReturnType<typeof createVercelGatewayEvaluator>['evaluate']>[0],
  ): Promise<VercelGatewayEvaluationResult>;
}

export interface SemanticResponseAssessmentDependencies {
  now?: () => number;
  getStore?: () => KeyValueStore | null;
  getCredentials?: typeof resolveServerProviderCredentials;
  createEvaluator?: (credentials: { apiKey: string; baseUrl?: string }) => Evaluator;
  recordCost?: typeof recordProviderCostEvent;
}

function modeFor(input: SemanticResponseAssessmentInput): AssessmentMode {
  if (input.enableResponseAssessment !== true) return 'off';
  return input.applyResponseAssessment === true ? 'active' : 'shadow';
}

function emptyTrace(
  mode: AssessmentMode,
  status: AssessmentStatus,
  reason: string,
): SemanticResponseAssessmentTrace {
  return {
    mode,
    status,
    reason,
    promptStamp: null,
    model: null,
    accepted: false,
    confidence: null,
    answerDepth: null,
    answerFormat: null,
    explanationRequired: null,
    clarification: null,
    inputTokens: null,
    outputTokens: null,
    providerCostMicrousd: null,
    durationMs: null,
  };
}

export function semanticResponseAssessmentSkipReason(
  input: SemanticResponseAssessmentInput,
  nowMs: number,
): string | null {
  if (modeFor(input) === 'off') return 'feature_disabled';
  if (input.surface !== 'web') return 'surface_ineligible';
  if (!isAutoModeModelId(input.requestedModel)) return 'manual_model';
  if (input.isFreePlan) return 'free_plan';
  if (input.hasMedia) return 'media_turn';
  if (input.initialBudget?.source !== 'default') return 'deterministic_budget';
  if (input.zeroDataRetentionOnly && !CONFIG.zeroDataRetentionVerified) {
    return 'zero_data_retention_unverified';
  }
  if (
    input.residencyRegion !== null &&
    !CONFIG.residencyRegions.includes(input.residencyRegion as never)
  ) {
    return 'residency_unverified';
  }
  if (policyRestrictsAnything(input.workspaceModelPolicy)) return 'workspace_policy_restricted';
  if (input.message.trim().length === 0) return 'empty_message';
  const promotionEnd = Date.parse(`${CONFIG.promotionEndsOn}T23:59:59.999Z`);
  if (!Number.isFinite(promotionEnd) || nowMs > promotionEnd) return 'pricing_verification_expired';
  return null;
}

function parseQuestions(text: string): EvaluationQuestions {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Response assessment prompt is not an object');
  }
  const questions = value as Record<string, unknown>;
  const expected = ['answer_depth', 'answer_format', 'clarification', 'explanation_required'];
  if (JSON.stringify(Object.keys(questions).sort()) !== JSON.stringify(expected)) {
    throw new Error('Response assessment prompt has the wrong question set');
  }
  for (const key of expected) {
    const question = questions[key];
    if (question === null || typeof question !== 'object' || Array.isArray(question)) {
      throw new Error('Response assessment prompt contains an invalid question');
    }
  }
  return questions as EvaluationQuestions;
}

function boundedMessage(message: string, maxStateBytes: number, taskType: RoutingTaskType): string {
  const encoder = new TextEncoder();
  const overhead = encoder.encode(JSON.stringify({ message: '', taskType })).byteLength;
  const byteLimit = Math.max(0, maxStateBytes - overhead);
  let used = 0;
  let result = '';
  for (const character of message) {
    const bytes = encoder.encode(character).byteLength;
    if (used + bytes > byteLimit) break;
    result += character;
    used += bytes;
  }
  return result;
}

function selectedChoice(
  answer: EvaluationAnswer | undefined,
  permitted: ReadonlySet<string>,
): { choice: string; confidence: number } | null {
  if (!answer || answer.type !== 'choice' || !permitted.has(answer.choice)) return null;
  const confidence = answer.probabilities[answer.choice];
  return typeof confidence === 'number' ? { choice: answer.choice, confidence } : null;
}

function assessmentFrom(result: VercelGatewayEvaluationResult): {
  assessment: Omit<SemanticResponseAssessment, 'accepted'>;
  confidence: number;
} | null {
  const depth = selectedChoice(result.answers['answer_depth'], ANSWER_DEPTH_SET);
  const format = selectedChoice(result.answers['answer_format'], ANSWER_FORMAT_SET);
  const clarification = selectedChoice(result.answers['clarification'], CLARIFICATION_SET);
  const explanation = result.answers['explanation_required'];
  if (!depth || !format || !clarification || explanation?.type !== 'boolean') return null;
  const explanationConfidence = Math.max(explanation.probability, 1 - explanation.probability);
  return {
    assessment: {
      answerDepth: depth.choice as SemanticResponseAssessment['answerDepth'],
      answerFormat: format.choice as SemanticResponseAssessment['answerFormat'],
      explanationRequired: explanation.probability >= 0.5,
      clarification: clarification.choice as SemanticResponseAssessment['clarification'],
    },
    confidence: Math.min(
      depth.confidence,
      format.confidence,
      clarification.confidence,
      explanationConfidence,
    ),
  };
}

async function reserveDailyInputTokens(
  store: KeyValueStore,
  nowMs: number,
): Promise<string | null> {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const key = `routing:response-assessment:input-tokens:${day}`;
  const reserved = CONFIG.limits.maxInputTokensPerRequest;
  const [current] = await store.batch().increment(key, reserved).expire(key, DAY_SECONDS).exec();
  if (typeof current !== 'number' || current > CONFIG.limits.dailyInputTokenCap) {
    await store.increment(key, -reserved);
    return null;
  }
  return key;
}

async function settleDailyInputTokens(
  store: KeyValueStore,
  key: string,
  actualInputTokens: number,
): Promise<void> {
  const reserved = CONFIG.limits.maxInputTokensPerRequest;
  const difference = actualInputTokens - reserved;
  if (difference === 0) return;
  await store.increment(key, difference);
}

function abortSignal(parent: AbortSignal | undefined): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent?.reason);
  if (parent?.aborted) onAbort();
  else parent?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('evaluation_timeout')),
    CONFIG.limits.timeoutMs,
  );
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    },
  };
}

async function evaluateOnce(
  input: SemanticResponseAssessmentInput,
  dependencies: SemanticResponseAssessmentDependencies,
): Promise<SemanticResponseAssessmentOutcome> {
  const mode = modeFor(input);
  const nowMs = (dependencies.now ?? Date.now)();
  const skipReason = semanticResponseAssessmentSkipReason(input, nowMs);
  if (skipReason) return { assessment: null, trace: emptyTrace(mode, 'skipped', skipReason) };
  const store = (dependencies.getStore ?? getKeyValueStore)();
  if (!store)
    return { assessment: null, trace: emptyTrace(mode, 'skipped', 'quota_store_unavailable') };
  let reservationKey: string;
  try {
    const reserved = await reserveDailyInputTokens(store, nowMs);
    if (!reserved) {
      return { assessment: null, trace: emptyTrace(mode, 'skipped', 'daily_input_limit') };
    }
    reservationKey = reserved;
  } catch {
    return { assessment: null, trace: emptyTrace(mode, 'failed', 'quota_store_failed') };
  }
  const credentials = (dependencies.getCredentials ?? resolveServerProviderCredentials)(
    CONFIG.transportProvider,
  );
  if (!credentials) {
    await settleDailyInputTokens(store, reservationKey, 0).catch(() => undefined);
    return { assessment: null, trace: emptyTrace(mode, 'skipped', 'credentials_unavailable') };
  }

  const prompt = resolvePrompt(CONFIG.promptId as PromptId, { variants: input.promptVariants });
  let questions: EvaluationQuestions;
  try {
    questions = parseQuestions(prompt.text);
  } catch {
    await settleDailyInputTokens(store, reservationKey, 0).catch(() => undefined);
    return { assessment: null, trace: emptyTrace(mode, 'failed', 'prompt_invalid') };
  }

  const evaluator = (dependencies.createEvaluator ?? createVercelGatewayEvaluator)(credentials);
  const timed = abortSignal(input.signal);
  const startedAt = (dependencies.now ?? Date.now)();
  try {
    const result = await evaluator.evaluate({
      model: CONFIG.model,
      state: {
        message: boundedMessage(input.message, CONFIG.limits.maxStateBytes, input.taskType),
        taskType: input.taskType,
      },
      questions,
      providerOptions: { gateway: { only: [CONFIG.upstreamProvider] } },
      signal: timed.signal,
    });
    await settleDailyInputTokens(store, reservationKey, result.usage.inputTokens).catch(
      () => undefined,
    );
    const parsed = assessmentFrom(result);
    const confident =
      parsed !== null && parsed.confidence >= CONFIG.limits.minimumSelectedProbability;
    const accepted = confident && mode === 'active';
    const durationMs = Math.max(0, (dependencies.now ?? Date.now)() - startedAt);
    await (dependencies.recordCost ?? recordProviderCostEvent)({
      userId: input.userId,
      organizationId: input.organizationId,
      workspaceId: input.organizationId,
      capability: 'chat',
      provider: CONFIG.transportProvider,
      model: result.model,
      unitBasis: 'token',
      units: result.usage.inputTokens + result.usage.outputTokens,
      providerCostCents:
        result.providerCostMicrousd === null ? 0 : Math.round(result.providerCostMicrousd / 10_000),
      providerReportedCostMicrousd: result.providerCostMicrousd,
      customerCanonicalMicrousd: 0,
      billedCents: 0,
      sourceRef: `semantic_response_assessment:${input.requestId}`,
      surface: input.surface,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      promptIds: [prompt.stamp],
      workload: 'chat',
      metadata: {
        operation: 'routing_assessment',
        mode,
        accepted,
        confidence: parsed?.confidence ?? null,
        durationMs,
        generationId: result.generationId,
        resolvedProvider: result.resolvedProvider,
      },
    }).catch(() => undefined);
    if (!parsed) {
      return {
        assessment: null,
        trace: {
          ...emptyTrace(mode, 'failed', 'answer_invalid'),
          promptStamp: prompt.stamp,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          providerCostMicrousd: result.providerCostMicrousd,
          durationMs,
        },
      };
    }
    const trace: SemanticResponseAssessmentTrace = {
      mode,
      status: 'assessed',
      reason: confident ? (accepted ? 'accepted' : 'shadow_only') : 'low_confidence',
      promptStamp: prompt.stamp,
      model: result.model,
      accepted,
      confidence: parsed.confidence,
      answerDepth: parsed.assessment.answerDepth,
      answerFormat: parsed.assessment.answerFormat,
      explanationRequired: parsed.assessment.explanationRequired,
      clarification: parsed.assessment.clarification,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      providerCostMicrousd: result.providerCostMicrousd,
      durationMs,
    };
    return {
      assessment: confident ? { ...parsed.assessment, accepted } : null,
      trace,
    };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    const reason = timed.signal.aborted ? 'timeout_or_cancelled' : 'evaluation_failed';
    logger.warn(
      {
        requestId: input.requestId,
        reason,
        errorName: error instanceof Error ? error.name : 'unknown',
      },
      'Semantic response assessment preserved the deterministic budget',
    );
    return { assessment: null, trace: emptyTrace(mode, 'failed', reason) };
  } finally {
    timed.cleanup();
  }
}

export function assessSemanticResponseBudget(
  input: SemanticResponseAssessmentInput,
  dependencies: SemanticResponseAssessmentDependencies = {},
): Promise<SemanticResponseAssessmentOutcome> {
  const key = `${input.userId}:${input.requestId}:${modeFor(input)}`;
  const existing = completed.get(key);
  if (existing) return existing;
  const mode = modeFor(input);
  const skipReason = semanticResponseAssessmentSkipReason(input, (dependencies.now ?? Date.now)());
  if (skipReason) {
    return Promise.resolve({
      assessment: null,
      trace: emptyTrace(mode, 'skipped', skipReason),
    });
  }
  if (inFlight >= CONFIG.limits.maxInFlight) {
    return Promise.resolve({
      assessment: null,
      trace: emptyTrace(mode, 'skipped', 'concurrency_limit'),
    });
  }
  inFlight += 1;
  const result = evaluateOnce(input, dependencies).finally(() => {
    inFlight -= 1;
  });
  completed.set(key, result);
  if (completed.size > 2_000) completed.delete(completed.keys().next().value as string);
  return result;
}

export function resetSemanticResponseAssessmentStateForTests(): void {
  completed.clear();
  inFlight = 0;
}
