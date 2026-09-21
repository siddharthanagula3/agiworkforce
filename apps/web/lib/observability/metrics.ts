import {
  metrics,
  type Attributes,
  type Counter,
  type Gauge,
  type Histogram,
  type MeterProvider,
} from '@opentelemetry/api';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions';
import { scrubAttributes } from '@agiworkforce/observability';

import { OBSERVABILITY_ATTRIBUTE, deploymentAttributes } from './attributes';
import { boundAttributes } from './cardinality';
import type { ClientFailureClass, ClientFailureDetail } from './client-failures';
import type { WorkPlanMeasure, WorkPlanShape } from './work-plan-measures';
import { SPAN_DOMAIN_ATTRIBUTE, TRACER_NAME } from './otel-span-bridge';

export const METRIC_NAME = {
  spanCount: 'agi.span.count',
  spanDuration: 'agi.span.duration',
  httpRequests: 'http.server.request.count',
  httpDuration: 'http.server.request.duration',
  toolCalls: 'agi.tool.calls',
  toolDuration: 'agi.tool.duration',
  browserTasks: 'agi.browser.tasks',
  notificationDeliveries: 'agi.notification.deliveries',
  failures: 'agi.failures',
  databaseOperations: 'db.client.operation.count',
  databaseDuration: 'db.client.operation.duration',
  queueDepth: 'agi.queue.depth',
  queueWait: 'agi.queue.wait',
  queueAge: 'agi.queue.age',
  queueStuck: 'agi.queue.stuck',
  routingDecisions: 'agi.routing.decisions',
  configurationState: 'agi.configuration.state',
  completions: 'agi.completions',
  falseSuccess: 'agi.completion.false_success',
  denials: 'agi.denials',
  rejections: 'agi.rejections',
  turns: 'agi.turns',
  turnTimeToFirstToken: 'agi.turn.time_to_first_token',
  turnDuration: 'agi.turn.duration',
  turnCost: 'agi.turn.cost',
  turnRetries: 'agi.turn.retries',
  clientFailures: 'agi.client.failures',
  workPlanSteps: 'agi.work.plan.steps',
  // The media instruments live in media-telemetry.ts, which imports span.ts,
  // which imports this file. Importing them back would be a cycle that leaves
  // this object half built, so the names are restated and
  // metrics.media-names.test.ts fails the moment the two lists disagree.
  mediaGenerations: 'agi.media.generations',
  mediaGenerationDuration: 'agi.media.generation.duration',
  mediaAttempts: 'agi.media.attempts',
  mediaAttemptDuration: 'agi.media.attempt.duration',
  mediaCallbacks: 'agi.media.callbacks',
  mediaPolls: 'agi.media.polls',
  mediaSafety: 'agi.media.safety',
} as const;

export type FailureKind =
  | 'api'
  | 'browser'
  | 'client'
  | 'connector'
  | 'database'
  | 'mcp'
  | 'model'
  | 'notification'
  | 'remote'
  | 'tool'
  | 'worker';

export type SpanOutcome = 'ok' | 'error';

const MILLISECONDS = 'ms';
const MICRO_USD = 'uUSD';
const SPAN_NAME_ATTRIBUTE = 'span.name';
const SPAN_STATUS_ATTRIBUTE = 'span.status';
const SERVER_ERROR_STATUS = 500;
const SERVER_ERROR_TYPE = '5xx';

interface Instruments {
  readonly spanCount: Counter;
  readonly spanDuration: Histogram;
  readonly httpRequests: Counter;
  readonly httpDuration: Histogram;
  readonly toolCalls: Counter;
  readonly toolDuration: Histogram;
  readonly browserTasks: Counter;
  readonly notificationDeliveries: Counter;
  readonly failures: Counter;
  readonly databaseOperations: Counter;
  readonly databaseDuration: Histogram;
  readonly queueDepth: Gauge;
  readonly queueWait: Histogram;
  readonly queueAge: Gauge;
  readonly queueStuck: Gauge;
  readonly routingDecisions: Counter;
  readonly configurationState: Gauge;
  readonly completions: Counter;
  readonly falseSuccess: Counter;
  readonly denials: Counter;
  readonly rejections: Counter;
  readonly turns: Counter;
  readonly turnTimeToFirstToken: Histogram;
  readonly turnDuration: Histogram;
  readonly turnCost: Histogram;
  readonly turnRetries: Counter;
  readonly clientFailures: Counter;
  readonly workPlanSteps: Gauge;
}

let cached: { provider: MeterProvider; instruments: Instruments } | null = null;

function instruments(): Instruments {
  const provider = metrics.getMeterProvider();
  if (cached?.provider === provider) return cached.instruments;
  const meter = provider.getMeter(TRACER_NAME);
  const created: Instruments = {
    spanCount: meter.createCounter(METRIC_NAME.spanCount),
    spanDuration: meter.createHistogram(METRIC_NAME.spanDuration, { unit: MILLISECONDS }),
    httpRequests: meter.createCounter(METRIC_NAME.httpRequests),
    httpDuration: meter.createHistogram(METRIC_NAME.httpDuration, { unit: MILLISECONDS }),
    toolCalls: meter.createCounter(METRIC_NAME.toolCalls),
    toolDuration: meter.createHistogram(METRIC_NAME.toolDuration, { unit: MILLISECONDS }),
    browserTasks: meter.createCounter(METRIC_NAME.browserTasks),
    notificationDeliveries: meter.createCounter(METRIC_NAME.notificationDeliveries),
    failures: meter.createCounter(METRIC_NAME.failures),
    databaseOperations: meter.createCounter(METRIC_NAME.databaseOperations),
    databaseDuration: meter.createHistogram(METRIC_NAME.databaseDuration, { unit: MILLISECONDS }),
    queueDepth: meter.createGauge(METRIC_NAME.queueDepth),
    queueWait: meter.createHistogram(METRIC_NAME.queueWait, { unit: MILLISECONDS }),
    queueAge: meter.createGauge(METRIC_NAME.queueAge, { unit: MILLISECONDS }),
    queueStuck: meter.createGauge(METRIC_NAME.queueStuck),
    routingDecisions: meter.createCounter(METRIC_NAME.routingDecisions),
    configurationState: meter.createGauge(METRIC_NAME.configurationState),
    completions: meter.createCounter(METRIC_NAME.completions),
    falseSuccess: meter.createCounter(METRIC_NAME.falseSuccess),
    denials: meter.createCounter(METRIC_NAME.denials),
    rejections: meter.createCounter(METRIC_NAME.rejections),
    turns: meter.createCounter(METRIC_NAME.turns),
    turnTimeToFirstToken: meter.createHistogram(METRIC_NAME.turnTimeToFirstToken, {
      unit: MILLISECONDS,
    }),
    turnDuration: meter.createHistogram(METRIC_NAME.turnDuration, { unit: MILLISECONDS }),
    turnCost: meter.createHistogram(METRIC_NAME.turnCost, { unit: MICRO_USD }),
    turnRetries: meter.createCounter(METRIC_NAME.turnRetries),
    clientFailures: meter.createCounter(METRIC_NAME.clientFailures),
    workPlanSteps: meter.createGauge(METRIC_NAME.workPlanSteps),
  };
  cached = { provider, instruments: created };
  return created;
}

// Release identity is a dimension of every series, not of the few call sites
// that remember to pass it. boundAttributes is the second half: scrubbing masks
// a secret inside a value, it does not stop the value being unique per request.
function clean(attributes: Readonly<Record<string, unknown>>): Attributes {
  return boundAttributes(scrubAttributes({ ...deploymentAttributes(), ...attributes }));
}

function nonNegative(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
}

export function recordSpanMetrics(input: {
  name: string;
  domain: string;
  outcome: SpanOutcome;
  durationMs: number;
  provider?: string | undefined;
  model?: string | undefined;
}): void {
  const attributes = clean({
    [SPAN_NAME_ATTRIBUTE]: input.name,
    [SPAN_DOMAIN_ATTRIBUTE]: input.domain,
    [SPAN_STATUS_ATTRIBUTE]: input.outcome,
    [OBSERVABILITY_ATTRIBUTE.providerName]: input.provider,
    [OBSERVABILITY_ATTRIBUTE.requestModel]: input.model,
  });
  const recorded = instruments();
  recorded.spanCount.add(1, attributes);
  recorded.spanDuration.record(nonNegative(input.durationMs), attributes);
}

export function recordHttpRequest(input: {
  method: string | undefined;
  statusCode: number;
  durationMs: number;
  surface?: string | undefined;
  clientVersion?: string | undefined;
  protocolVersion?: string | undefined;
}): void {
  const attributes = clean({
    [ATTR_HTTP_REQUEST_METHOD]: input.method,
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: input.statusCode,
    [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
    [OBSERVABILITY_ATTRIBUTE.clientVersion]: input.clientVersion,
    [OBSERVABILITY_ATTRIBUTE.protocolVersion]: input.protocolVersion,
    [OBSERVABILITY_ATTRIBUTE.errorType]:
      input.statusCode >= SERVER_ERROR_STATUS ? SERVER_ERROR_TYPE : undefined,
  });
  const recorded = instruments();
  recorded.httpRequests.add(1, attributes);
  recorded.httpDuration.record(nonNegative(input.durationMs), attributes);
  if (input.statusCode >= SERVER_ERROR_STATUS) recordFailure('api', SERVER_ERROR_TYPE);
}

export function recordFailure(kind: FailureKind, errorType?: string): void {
  instruments().failures.add(
    1,
    clean({
      [OBSERVABILITY_ATTRIBUTE.failureKind]: kind,
      [OBSERVABILITY_ATTRIBUTE.errorType]: errorType,
    }),
  );
}

export type DenialLayer = 'capability' | 'policy' | 'entitlement' | 'surface';

/**
 * A refusal the product made on purpose, counted by the layer that made it. The
 * four layers refuse for different reasons and are fixed in different places:
 * a capability the build does not carry, a policy the workspace set, an
 * entitlement the plan does not include, and a surface the feature never
 * supported. One counter with one reason string would make them one number.
 */
export function recordDenial(input: {
  layer: DenialLayer;
  reason: string;
  surface: string;
  workspaceKind?: WorkspaceKind | undefined;
}): void {
  instruments().denials.add(
    1,
    clean({
      [OBSERVABILITY_ATTRIBUTE.denialLayer]: input.layer,
      [OBSERVABILITY_ATTRIBUTE.denialReason]: input.reason,
      [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
      [OBSERVABILITY_ATTRIBUTE.workspaceKind]: input.workspaceKind,
    }),
  );
}

export type RejectionKind =
  | 'contract_decode'
  | 'sync_conflict'
  | 'unknown_event'
  | 'unknown_content_block'
  | 'workspace_switch';

/**
 * Input the product could not make sense of, which is a different failure from
 * a refusal: nobody decided it, so every one of these is a contract the two
 * ends disagree about and a client version is the first thing to look at.
 */
export function recordRejection(input: {
  kind: RejectionKind;
  reason: string;
  surface: string;
  clientVersion?: string | undefined;
  protocolVersion?: string | undefined;
}): void {
  instruments().rejections.add(
    1,
    clean({
      [OBSERVABILITY_ATTRIBUTE.rejectionKind]: input.kind,
      [OBSERVABILITY_ATTRIBUTE.rejectionReason]: input.reason,
      [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
      [OBSERVABILITY_ATTRIBUTE.clientVersion]: input.clientVersion,
      [OBSERVABILITY_ATTRIBUTE.protocolVersion]: input.protocolVersion,
    }),
  );
  recordFailure('api', input.kind);
}

export type WorkspaceKind = 'personal' | 'organization';

export type TurnOutcome = 'succeeded' | 'failed';

export type CacheOutcome = 'hit' | 'miss';

/**
 * What one served turn cost in time and money, split by the dimensions a
 * regression is attributed along. Time to first token and wall time are
 * separate instruments because a turn can be fast to start and slow to finish,
 * and a p99 over their sum hides which of the two moved.
 */
export function recordTurnOutcome(input: {
  outcome: TurnOutcome;
  surface: string;
  provider: string | null;
  modelKey: string | null;
  routeId?: string | null;
  mode?: string | undefined;
  trustMode?: string | undefined;
  workspaceKind?: WorkspaceKind | undefined;
  /** The rollout arm and flag variants the turn was served under. */
  cohort?: string | null | undefined;
  cache?: CacheOutcome | undefined;
  timeToFirstTokenMs?: number | null | undefined;
  durationMs?: number | null | undefined;
  costMicroUsd?: number | null | undefined;
  retries?: number | undefined;
  errorType?: string | undefined;
}): void {
  const attributes = clean({
    [OBSERVABILITY_ATTRIBUTE.turnOutcome]: input.outcome,
    [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
    [OBSERVABILITY_ATTRIBUTE.providerName]: input.provider ?? undefined,
    [OBSERVABILITY_ATTRIBUTE.requestModel]: input.modelKey ?? undefined,
    [OBSERVABILITY_ATTRIBUTE.routeId]: input.routeId ?? undefined,
    [OBSERVABILITY_ATTRIBUTE.requestMode]: input.mode,
    [OBSERVABILITY_ATTRIBUTE.trustMode]: input.trustMode,
    [OBSERVABILITY_ATTRIBUTE.workspaceKind]: input.workspaceKind,
    [OBSERVABILITY_ATTRIBUTE.routingCohort]: input.cohort ?? undefined,
    [OBSERVABILITY_ATTRIBUTE.cacheOutcome]: input.cache,
    [OBSERVABILITY_ATTRIBUTE.errorType]: input.errorType,
  });
  const recorded = instruments();
  recorded.turns.add(1, attributes);
  if (typeof input.timeToFirstTokenMs === 'number') {
    recorded.turnTimeToFirstToken.record(nonNegative(input.timeToFirstTokenMs), attributes);
  }
  if (typeof input.durationMs === 'number') {
    recorded.turnDuration.record(nonNegative(input.durationMs), attributes);
  }
  if (typeof input.costMicroUsd === 'number') {
    recorded.turnCost.record(nonNegative(input.costMicroUsd), attributes);
  }
  const retries = Math.max(0, Math.trunc(input.retries ?? 0));
  if (retries > 0) recorded.turnRetries.add(retries, attributes);
  if (input.outcome === 'failed') recordFailure('model', input.errorType);
}

// A failure the server never sees because it happened after the response, so
// no existing series moves however often it happens.
export function recordClientFailure(input: {
  failure: ClientFailureClass;
  detail?: ClientFailureDetail | undefined;
  surface?: string | undefined;
  clientVersion?: string | undefined;
}): void {
  instruments().clientFailures.add(
    1,
    clean({
      [OBSERVABILITY_ATTRIBUTE.clientFailureClass]: input.failure,
      [OBSERVABILITY_ATTRIBUTE.clientFailureDetail]: input.detail,
      [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
      [OBSERVABILITY_ATTRIBUTE.clientVersion]: input.clientVersion,
    }),
  );
  recordFailure('client', input.failure);
}

// A plan the agent keeps extending and a plan it finishes are both one run that
// ended; this is the only reading of the difference.
export function recordWorkPlanSize(input: {
  shape: WorkPlanShape;
  steps: number;
  completed: number;
}): void {
  const recorded = instruments();
  const measure = (kind: WorkPlanMeasure, value: number): void => {
    recorded.workPlanSteps.record(
      Math.max(0, Math.trunc(value)),
      clean({
        [OBSERVABILITY_ATTRIBUTE.workPlanShape]: input.shape,
        [OBSERVABILITY_ATTRIBUTE.workPlanMeasure]: kind,
      }),
    );
  };
  measure('steps', input.steps);
  measure('completed', input.completed);
}

export type DatabaseOutcome = 'ok' | 'error';

const DATABASE_OPERATION_ATTRIBUTE = 'db.operation.name';
const DATABASE_OUTCOME_ATTRIBUTE = 'db.operation.outcome';

export function recordDatabaseOperation(input: {
  operation: string;
  outcome: DatabaseOutcome;
  durationMs: number;
  errorType?: string | undefined;
}): void {
  const attributes = clean({
    [DATABASE_OPERATION_ATTRIBUTE]: input.operation,
    [DATABASE_OUTCOME_ATTRIBUTE]: input.outcome,
  });
  const recorded = instruments();
  recorded.databaseOperations.add(1, attributes);
  recorded.databaseDuration.record(nonNegative(input.durationMs), attributes);
  if (input.outcome === 'error') recordFailure('database', input.errorType);
}

export type QueueDepthStatus = 'queued' | 'running' | 'dead';

const QUEUE_DEPTH_STATUS_ATTRIBUTE = 'agi.queue.status';

export function recordQueueDepth(input: {
  queue: string;
  status: QueueDepthStatus;
  count: number;
}): void {
  instruments().queueDepth.record(
    nonNegative(input.count),
    clean({
      [OBSERVABILITY_ATTRIBUTE.queueName]: input.queue,
      [QUEUE_DEPTH_STATUS_ATTRIBUTE]: input.status,
    }),
  );
}

export function recordQueueWait(input: { queue: string; waitMs: number }): void {
  instruments().queueWait.record(
    nonNegative(input.waitMs),
    clean({ [OBSERVABILITY_ATTRIBUTE.queueName]: input.queue }),
  );
}

/**
 * The age of the oldest work a queue has not started, and the count of jobs
 * holding a lease nobody renewed. A job that is stuck is neither dead nor
 * finished, so neither the dead-letter count nor the success rate moves.
 */
export function recordQueueAge(input: {
  queue: string;
  oldestQueuedAgeMs: number;
  stuck: number;
}): void {
  const attributes = clean({ [OBSERVABILITY_ATTRIBUTE.queueName]: input.queue });
  const recorded = instruments();
  recorded.queueAge.record(nonNegative(input.oldestQueuedAgeMs), attributes);
  recorded.queueStuck.record(nonNegative(input.stuck), attributes);
  if (input.stuck > 0) recordFailure('worker', 'stuck_job');
}

export type ConfigurationState = 'ok' | 'invalid' | 'unavailable';

const CONFIGURATION_STATE_VALUE: Readonly<Record<ConfigurationState, number>> = {
  ok: 1,
  unavailable: 0,
  invalid: -1,
};

export interface ConfigurationStateReport {
  readonly component: string;
  readonly state: ConfigurationState;
  readonly observedAt: string;
}

const LAST_CONFIGURATION_STATE = new Map<string, ConfigurationStateReport>();

/**
 * What a boot-time check found, as a standing series rather than a log line
 * nobody reads again. An optional integration that is simply absent reads
 * `unavailable`, which is not the same as configured and wrong.
 */
export function recordConfigurationState(input: {
  component: string;
  state: ConfigurationState;
}): void {
  LAST_CONFIGURATION_STATE.set(input.component, {
    component: input.component,
    state: input.state,
    observedAt: new Date().toISOString(),
  });
  instruments().configurationState.record(
    CONFIGURATION_STATE_VALUE[input.state],
    clean({
      [OBSERVABILITY_ATTRIBUTE.configurationComponent]: input.component,
      [OBSERVABILITY_ATTRIBUTE.configurationState]: input.state,
    }),
  );
}

/**
 * The gauge is write-only to this process, so a boot-time finding is otherwise
 * unreadable from a request. This is what makes one answerable at /api/health.
 */
export function configurationStates(): readonly ConfigurationStateReport[] {
  return [...LAST_CONFIGURATION_STATE.values()].sort((left, right) =>
    left.component.localeCompare(right.component),
  );
}

export type RoutingDecisionStatus = 'selected' | 'unavailable';

export function recordRoutingDecision(input: {
  status: RoutingDecisionStatus;
  routeId: string | null;
  provider: string | null;
  modelKey: string | null;
  cohort: string | null;
  trustMode: string;
  region: string | null;
  surface: string;
}): void {
  instruments().routingDecisions.add(
    1,
    clean({
      [OBSERVABILITY_ATTRIBUTE.routeId]: input.routeId ?? undefined,
      [OBSERVABILITY_ATTRIBUTE.providerName]: input.provider ?? undefined,
      [OBSERVABILITY_ATTRIBUTE.requestModel]: input.modelKey ?? undefined,
      [OBSERVABILITY_ATTRIBUTE.routingCohort]: input.cohort ?? undefined,
      [OBSERVABILITY_ATTRIBUTE.trustMode]: input.trustMode,
      [OBSERVABILITY_ATTRIBUTE.dataRegion]: input.region ?? undefined,
      [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
      [OBSERVABILITY_ATTRIBUTE.routingStatus]: input.status,
    }),
  );
  if (input.status === 'unavailable') recordFailure('model', 'no_route');
}

export type BrowserTaskStatus =
  'handed_off' | 'completed' | 'failed' | 'blocked' | 'sent_to_device';

export function recordBrowserTask(input: {
  status: BrowserTaskStatus;
  surface: string;
  errorType?: string | undefined;
}): void {
  instruments().browserTasks.add(
    1,
    clean({
      [OBSERVABILITY_ATTRIBUTE.browserTaskStatus]: input.status,
      [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
    }),
  );
  if (input.status === 'failed') recordFailure('browser', input.errorType);
}

export type NotificationChannel = 'email' | 'push_expo' | 'push_web';

export type NotificationOutcome = 'delivered' | 'failed' | 'not_configured';

export function recordNotificationDelivery(input: {
  channel: NotificationChannel;
  outcome: NotificationOutcome;
  reason?: string | undefined;
  count?: number;
}): void {
  const attempts = Math.max(0, Math.trunc(input.count ?? 1));
  if (attempts === 0) return;
  instruments().notificationDeliveries.add(
    attempts,
    clean({
      [OBSERVABILITY_ATTRIBUTE.notificationChannel]: input.channel,
      [OBSERVABILITY_ATTRIBUTE.notificationOutcome]: input.outcome,
      [OBSERVABILITY_ATTRIBUTE.notificationReason]: input.reason,
    }),
  );
  if (input.outcome === 'failed') recordFailure('notification', input.reason);
}

export type CompletionStatus = 'completed' | 'failed' | 'cancelled' | 'partial';

export type CompletionKind = 'turn' | 'tool' | 'task';

export interface CompletionEvidence {
  reportedStatus: string;
  error?: unknown;
  errorType?: string | null | undefined;
  httpStatus?: number | null | undefined;
  output?: unknown;
  outputRequired?: boolean;
}

export interface ResolvedCompletion {
  status: CompletionStatus;
  reportedStatus: string;
  falseSuccess: boolean;
  reason: string | null;
}

const REPORTED_SUCCESS = new Set([
  'completed',
  'complete',
  'done',
  'finished',
  'ok',
  'success',
  'succeeded',
]);

const REPORTED_CANCELLED = new Set(['cancelled', 'canceled', 'aborted', 'stopped']);

const REPORTED_FAILED = new Set([
  'blocked',
  'denied',
  'error',
  'errored',
  'failed',
  'rejected',
  'timed_out',
  'timeout',
]);

const CLIENT_ERROR_STATUS = 400;

function hasError(evidence: CompletionEvidence): boolean {
  if (evidence.error !== undefined && evidence.error !== null) return true;
  return typeof evidence.errorType === 'string' && evidence.errorType.length > 0;
}

function hasOutput(output: unknown): boolean {
  if (output === undefined || output === null) return false;
  if (typeof output === 'string') return output.trim().length > 0;
  if (Array.isArray(output)) return output.length > 0;
  if (typeof output === 'object') return Object.keys(output as object).length > 0;
  return true;
}

/**
 * What actually happened, which is not what the caller called it. A reported
 * success that carries an error, an error status code, or no output it was
 * required to produce is not a completion, and the disagreement is counted so a
 * surface that keeps claiming Done over a failed call is visible.
 */
export function resolveCompletion(evidence: CompletionEvidence): ResolvedCompletion {
  const reported = evidence.reportedStatus.trim().toLowerCase();
  const claimedSuccess = REPORTED_SUCCESS.has(reported);
  const resolve = (status: CompletionStatus, reason: string | null): ResolvedCompletion => ({
    status,
    reportedStatus: evidence.reportedStatus,
    falseSuccess: claimedSuccess && status !== 'completed',
    reason,
  });

  if (REPORTED_CANCELLED.has(reported)) return resolve('cancelled', null);
  if (hasError(evidence)) return resolve('failed', 'error_present');
  if (typeof evidence.httpStatus === 'number' && evidence.httpStatus >= CLIENT_ERROR_STATUS) {
    return resolve('failed', `http_${evidence.httpStatus}`);
  }
  if (REPORTED_FAILED.has(reported)) return resolve('failed', 'reported_failed');
  if (!claimedSuccess) return resolve('partial', 'unrecognized_status');
  if (evidence.outputRequired && !hasOutput(evidence.output)) {
    return resolve('partial', 'no_output');
  }
  return resolve('completed', null);
}

/**
 * The completion status a user sees, recorded next to the status the code
 * reported. Infrastructure success is not the same signal and is not recorded
 * here.
 */
export function recordCompletion(input: {
  kind: CompletionKind;
  surface: string;
  evidence: CompletionEvidence;
  category?: string | undefined;
}): ResolvedCompletion {
  const resolved = resolveCompletion(input.evidence);
  const attributes = clean({
    [OBSERVABILITY_ATTRIBUTE.completionKind]: input.kind,
    [OBSERVABILITY_ATTRIBUTE.completionStatus]: resolved.status,
    [OBSERVABILITY_ATTRIBUTE.completionReportedStatus]: resolved.reportedStatus,
    [OBSERVABILITY_ATTRIBUTE.completionReason]: resolved.reason ?? undefined,
    [OBSERVABILITY_ATTRIBUTE.surface]: input.surface,
    [OBSERVABILITY_ATTRIBUTE.toolCategory]: input.category,
  });
  const recorded = instruments();
  recorded.completions.add(1, attributes);
  if (resolved.falseSuccess) {
    recorded.falseSuccess.add(1, attributes);
  }
  return resolved;
}

const CATEGORY_FAILURE_KIND: Readonly<Record<string, FailureKind>> = {
  mcp: 'mcp',
  connector: 'connector',
  'computer-use': 'browser',
};

export function recordToolOutcome(input: {
  category: string;
  status: string;
  durationMs?: number | undefined;
  remote?: boolean;
  surface?: string | undefined;
  error?: unknown;
  errorType?: string | null | undefined;
  output?: unknown;
  outputRequired?: boolean;
}): ResolvedCompletion {
  const attributes = clean({
    [OBSERVABILITY_ATTRIBUTE.toolCategory]: input.category,
    [OBSERVABILITY_ATTRIBUTE.toolStatus]: input.status,
  });
  const recorded = instruments();
  recorded.toolCalls.add(1, attributes);
  if (input.durationMs !== undefined) {
    recorded.toolDuration.record(nonNegative(input.durationMs), attributes);
  }

  const resolved = recordCompletion({
    kind: 'tool',
    surface: input.surface ?? 'unknown',
    category: input.category,
    evidence: {
      reportedStatus: input.status,
      error: input.error,
      errorType: input.errorType,
      output: input.output,
      ...(input.outputRequired === undefined ? {} : { outputRequired: input.outputRequired }),
    },
  });

  if (resolved.status !== 'failed') return resolved;
  recordFailure('tool', input.category);
  if (input.remote) {
    recordFailure('remote', input.category);
    return resolved;
  }
  const specific = CATEGORY_FAILURE_KIND[input.category];
  if (specific) recordFailure(specific, input.category);
  return resolved;
}
