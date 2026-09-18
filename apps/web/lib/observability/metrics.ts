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
} as const;

export type FailureKind =
  | 'api'
  | 'browser'
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
  };
  cached = { provider, instruments: created };
  return created;
}

// Release identity is a dimension of every series, not of the few call sites
// that remember to pass it.
function clean(attributes: Readonly<Record<string, unknown>>): Attributes {
  return scrubAttributes({ ...deploymentAttributes(), ...attributes });
}

function nonNegative(durationMs: number): number {
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
}

export function recordSpanMetrics(input: {
  name: string;
  domain: string;
  outcome: SpanOutcome;
  durationMs: number;
}): void {
  const attributes = clean({
    [SPAN_NAME_ATTRIBUTE]: input.name,
    [SPAN_DOMAIN_ATTRIBUTE]: input.domain,
    [SPAN_STATUS_ATTRIBUTE]: input.outcome,
  });
  const recorded = instruments();
  recorded.spanCount.add(1, attributes);
  recorded.spanDuration.record(nonNegative(input.durationMs), attributes);
}

export function recordHttpRequest(input: {
  method: string | undefined;
  statusCode: number;
  durationMs: number;
}): void {
  const attributes = clean({
    [ATTR_HTTP_REQUEST_METHOD]: input.method,
    [ATTR_HTTP_RESPONSE_STATUS_CODE]: input.statusCode,
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

/**
 * What a boot-time check found, as a standing series rather than a log line
 * nobody reads again. An optional integration that is simply absent reads
 * `unavailable`, which is not the same as configured and wrong.
 */
export function recordConfigurationState(input: {
  component: string;
  state: ConfigurationState;
}): void {
  instruments().configurationState.record(
    CONFIGURATION_STATE_VALUE[input.state],
    clean({
      [OBSERVABILITY_ATTRIBUTE.configurationComponent]: input.component,
      [OBSERVABILITY_ATTRIBUTE.configurationState]: input.state,
    }),
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

const TOOL_FAILURE_STATUS = 'failed';

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
}): void {
  const attributes = clean({
    [OBSERVABILITY_ATTRIBUTE.toolCategory]: input.category,
    [OBSERVABILITY_ATTRIBUTE.toolStatus]: input.status,
  });
  const recorded = instruments();
  recorded.toolCalls.add(1, attributes);
  if (input.durationMs !== undefined) {
    recorded.toolDuration.record(nonNegative(input.durationMs), attributes);
  }
  if (input.status !== TOOL_FAILURE_STATUS) return;
  recordFailure('tool', input.category);
  if (input.remote) {
    recordFailure('remote', input.category);
    return;
  }
  const specific = CATEGORY_FAILURE_KIND[input.category];
  if (specific) recordFailure(specific, input.category);
}
