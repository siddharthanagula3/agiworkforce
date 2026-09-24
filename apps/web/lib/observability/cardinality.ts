import { DECISION_FALLBACK_REASONS, DECISION_STATUSES } from '@agiworkforce/agent-core';
import { ErrorCode } from '@agiworkforce/types';

import {
  DECISION_COMPARISON_KEYS,
  DECISION_CONFIDENCE_BINS,
  DECISION_KIND_IDS,
  DECISION_SKIP_REASONS,
} from '@/lib/services/semantic-decisions/kinds';

import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { CLIENT_FAILURE_CLASSES, CLIENT_FAILURE_DETAILS } from './client-failures';
import { CODE_ACTIONS } from './code-actions';
import { CLIENT_VERSION_LABELS } from './client-versions';
import { WORK_PLAN_MEASURES, WORK_PLAN_SHAPES } from './work-plan-measures';

export const UNCLASSIFIED_LABEL = 'unclassified';
export const OVERFLOW_LABEL = 'other';
export const DEFAULT_LABEL_LIMIT = 50;

export type LabelBound =
  | { readonly kind: 'identifier' }
  | { readonly kind: 'enumerated'; readonly values: ReadonlySet<string> }
  | { readonly kind: 'bounded'; readonly limit: number }
  | { readonly kind: 'classified'; readonly limit: number };

const IDENTIFIER: LabelBound = { kind: 'identifier' };

function enumerated(...values: readonly string[]): LabelBound {
  return { kind: 'enumerated', values: new Set(values) };
}

function bounded(limit = DEFAULT_LABEL_LIMIT): LabelBound {
  return { kind: 'bounded', limit };
}

function classified(limit = DEFAULT_LABEL_LIMIT): LabelBound {
  return { kind: 'classified', limit };
}

// Labels metrics.ts and media-telemetry.ts build themselves rather than taking
// from OBSERVABILITY_ATTRIBUTE. metric-cardinality.test.ts fails if either file
// emits a label this map does not name.
export const LOCAL_METRIC_LABEL = {
  spanName: 'span.name',
  spanStatus: 'span.status',
  spanDomain: 'span_domain',
  httpMethod: 'http.request.method',
  httpStatusCode: 'http.response.status_code',
  databaseOperation: 'db.operation.name',
  databaseOutcome: 'db.operation.outcome',
  queueStatus: 'agi.queue.status',
  mediaKind: 'media.kind',
  mediaProvider: 'media.provider',
  mediaModel: 'media.model',
  mediaSurface: 'media.surface',
  mediaMode: 'media.mode',
  mediaOutcome: 'media.outcome',
  mediaAttempt: 'media.attempt',
  mediaJobId: 'media.job_id',
  mediaDecision: 'media.safety_decision',
  mediaReason: 'media.reason',
} as const;

/**
 * What each metric label is allowed to carry. `identifier` is the important
 * one: a per-request id multiplies every series by the request count, so it is
 * dropped from metrics rather than trimmed, and lives on the span instead.
 */
export const METRIC_LABEL_BOUND: Readonly<Record<string, LabelBound>> = {
  [OBSERVABILITY_ATTRIBUTE.sessionId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.turnId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.runId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.toolCallId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.providerRequestId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.queueJobId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.browserTaskId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.remoteSessionId]: IDENTIFIER,
  [OBSERVABILITY_ATTRIBUTE.remoteDeviceId]: IDENTIFIER,
  // Stable per fault rather than per occurrence, but one series per distinct
  // exception site is still more than a metric should carry; it belongs on the
  // error record, which is where it is set.
  [OBSERVABILITY_ATTRIBUTE.errorFingerprint]: IDENTIFIER,
  [LOCAL_METRIC_LABEL.mediaJobId]: IDENTIFIER,

  [OBSERVABILITY_ATTRIBUTE.errorType]: classified(),
  [OBSERVABILITY_ATTRIBUTE.notificationReason]: classified(),
  [OBSERVABILITY_ATTRIBUTE.completionReason]: classified(),
  [OBSERVABILITY_ATTRIBUTE.denialReason]: classified(),
  [OBSERVABILITY_ATTRIBUTE.rejectionReason]: classified(),
  [LOCAL_METRIC_LABEL.mediaReason]: classified(),

  [OBSERVABILITY_ATTRIBUTE.surface]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.toolName]: bounded(200),
  [OBSERVABILITY_ATTRIBUTE.toolCategory]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.toolStatus]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.providerName]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.requestModel]: bounded(200),
  [OBSERVABILITY_ATTRIBUTE.responseModel]: bounded(200),
  [OBSERVABILITY_ATTRIBUTE.queueName]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.browserTaskStatus]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.notificationChannel]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.notificationOutcome]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.failureKind]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.serviceVersion]: bounded(100),
  [OBSERVABILITY_ATTRIBUTE.deploymentId]: bounded(100),
  [OBSERVABILITY_ATTRIBUTE.deploymentEnvironment]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.cloudRegion]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.clientVersion]: enumerated(...CLIENT_VERSION_LABELS),
  [OBSERVABILITY_ATTRIBUTE.protocolVersion]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.dataRegion]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.trustMode]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.workspaceKind]: enumerated('personal', 'organization'),
  [OBSERVABILITY_ATTRIBUTE.requestMode]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.denialLayer]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.rejectionKind]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.turnOutcome]: enumerated('succeeded', 'failed'),
  [OBSERVABILITY_ATTRIBUTE.cacheOutcome]: enumerated('hit', 'miss'),
  [OBSERVABILITY_ATTRIBUTE.routeId]: bounded(200),
  [OBSERVABILITY_ATTRIBUTE.routingCohort]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.routingStatus]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.configurationComponent]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.configurationState]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.completionKind]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.completionStatus]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.completionReportedStatus]: bounded(),
  [OBSERVABILITY_ATTRIBUTE.codeAction]: enumerated(...CODE_ACTIONS),
  [OBSERVABILITY_ATTRIBUTE.workPlanShape]: enumerated(...WORK_PLAN_SHAPES),
  [OBSERVABILITY_ATTRIBUTE.workPlanMeasure]: enumerated(...WORK_PLAN_MEASURES),
  // Authored in a browser, so enumerated rather than bounded: a limit still
  // admits as many invented values as the limit allows.
  [OBSERVABILITY_ATTRIBUTE.clientFailureClass]: enumerated(...CLIENT_FAILURE_CLASSES),
  [OBSERVABILITY_ATTRIBUTE.clientFailureDetail]: enumerated(...CLIENT_FAILURE_DETAILS),

  // Closed, not bounded: these vocabularies are exhaustive, so a value outside
  // them is a defect worth seeing as `unclassified`, not a new series.
  [OBSERVABILITY_ATTRIBUTE.decisionKind]: enumerated(...DECISION_KIND_IDS),
  [OBSERVABILITY_ATTRIBUTE.decisionMode]: enumerated('disabled', 'shadow', 'enabled'),
  [OBSERVABILITY_ATTRIBUTE.decisionOutcome]: enumerated(...DECISION_STATUSES, 'skipped'),
  [OBSERVABILITY_ATTRIBUTE.decisionQuestion]: enumerated(...DECISION_COMPARISON_KEYS),
  [OBSERVABILITY_ATTRIBUTE.decisionFallbackReason]: enumerated(
    ...DECISION_FALLBACK_REASONS,
    ...DECISION_SKIP_REASONS,
  ),
  [OBSERVABILITY_ATTRIBUTE.decisionConfidenceBin]: enumerated(...DECISION_CONFIDENCE_BINS),

  [LOCAL_METRIC_LABEL.spanName]: bounded(200),
  [LOCAL_METRIC_LABEL.spanDomain]: bounded(),
  [LOCAL_METRIC_LABEL.spanStatus]: enumerated('ok', 'error'),
  [LOCAL_METRIC_LABEL.httpMethod]: enumerated(
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'TRACE',
    'CONNECT',
  ),
  [LOCAL_METRIC_LABEL.httpStatusCode]: bounded(100),
  [LOCAL_METRIC_LABEL.databaseOperation]: bounded(200),
  [LOCAL_METRIC_LABEL.databaseOutcome]: enumerated('ok', 'error'),
  [LOCAL_METRIC_LABEL.queueStatus]: bounded(),
  [LOCAL_METRIC_LABEL.mediaKind]: bounded(),
  [LOCAL_METRIC_LABEL.mediaProvider]: bounded(),
  [LOCAL_METRIC_LABEL.mediaModel]: bounded(200),
  [LOCAL_METRIC_LABEL.mediaSurface]: bounded(),
  [LOCAL_METRIC_LABEL.mediaMode]: bounded(),
  [LOCAL_METRIC_LABEL.mediaOutcome]: bounded(),
  [LOCAL_METRIC_LABEL.mediaAttempt]: bounded(),
  [LOCAL_METRIC_LABEL.mediaDecision]: bounded(),
};

// A code, not a message: one word of at most 32 characters. Masking a secret is
// the scrubbing layer's job and runs before this one; the length is here
// because an exception message is unique per occurrence, not because it leaks.
const ERROR_CODE_TOKEN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const HTTP_ERROR_CLASS = /^[45]xx$/;

// Built on first use rather than at import: this module is pulled in by every
// recorder, and reading the catalogue at module scope makes loading an
// instrument depend on the whole contracts package being resolved first.
let canonicalErrorCodes: ReadonlySet<string> | null = null;

function isCanonicalErrorCode(value: string): boolean {
  if (canonicalErrorCodes === null) {
    // Bounding a label must never be the reason a recorder throws into the code
    // it is measuring. A catalogue this process cannot read costs the canonical
    // spelling, not the caller, and the token rule below still bounds the label.
    try {
      canonicalErrorCodes = new Set(Object.values(ErrorCode).map((code) => code.toLowerCase()));
    } catch {
      canonicalErrorCodes = new Set<string>();
    }
  }
  return canonicalErrorCodes.has(value);
}

/**
 * A metric label built from an error. Anything that is not a code the repo
 * names, an HTTP class or a short token becomes one class, so an exception
 * message cannot open a series per request.
 */
export function classifyErrorType(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return UNCLASSIFIED_LABEL;
  if (HTTP_ERROR_CLASS.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (isCanonicalErrorCode(lower)) return lower;
  return ERROR_CODE_TOKEN.test(trimmed) ? trimmed : UNCLASSIFIED_LABEL;
}

const seenValues = new Map<string, Set<string>>();

function withinLimit(label: string, value: string, limit: number): string {
  let seen = seenValues.get(label);
  if (!seen) {
    seen = new Set();
    seenValues.set(label, seen);
  }
  if (seen.has(value)) return value;
  if (seen.size >= limit) return OVERFLOW_LABEL;
  seen.add(value);
  return value;
}

export function resetLabelCardinality(): void {
  seenValues.clear();
}

export function labelBound(label: string): LabelBound {
  return METRIC_LABEL_BOUND[label] ?? bounded();
}

/**
 * The bounded value of one label, or null when the label must not reach a
 * metric at all.
 */
export function boundLabelValue(
  label: string,
  value: string | number | boolean,
): string | number | boolean | null {
  const bound = labelBound(label);
  if (bound.kind === 'identifier') return null;
  if (typeof value === 'boolean') return value;
  const text = String(value);
  if (bound.kind === 'enumerated') return bound.values.has(text) ? value : UNCLASSIFIED_LABEL;
  const candidate = bound.kind === 'classified' ? classifyErrorType(text) : text;
  const capped = withinLimit(label, candidate, bound.limit);
  return capped === text ? value : capped;
}

export function boundAttributes(
  attributes: Readonly<Record<string, string | number | boolean>>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [label, value] of Object.entries(attributes)) {
    const bound = boundLabelValue(label, value);
    if (bound !== null) out[label] = bound;
  }
  return out;
}
