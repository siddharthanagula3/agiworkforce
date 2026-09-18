import { metrics, type Attributes, type Counter, type Histogram } from '@opentelemetry/api';
import { scrubAttributes } from '@agiworkforce/observability';

import { deploymentAttributes } from './attributes';
import { TRACER_NAME } from './otel-span-bridge';
import { withSpan, type ActiveSpan } from './span';

export const MEDIA_METRIC_NAME = {
  generations: 'agi.media.generations',
  generationDuration: 'agi.media.generation.duration',
  attempts: 'agi.media.attempts',
  attemptDuration: 'agi.media.attempt.duration',
  callbacks: 'agi.media.callbacks',
  polls: 'agi.media.polls',
  safety: 'agi.media.safety',
} as const;

export type MediaKind = 'image' | 'video';

export type MediaGenerationMode = 'sync' | 'async' | 'edit';

export type MediaGenerationOutcome =
  'accepted' | 'completed' | 'failed' | 'canceled' | 'refused' | 'rejected';

export type MediaAttemptOutcome = 'started' | 'completed' | 'failed' | 'deferred' | 'canceled';

export type MediaCallbackOutcome = 'accepted' | 'ignored' | 'unauthorized' | 'malformed';

export type MediaPollOutcome = 'claimed' | 'pending' | 'settled' | 'exhausted';

export type MediaSafetyDecision = 'blocked' | 'flagged' | 'allowed';

const MILLISECONDS = 'ms';
const MEDIA_SPAN_DOMAIN = 'model';

export const MEDIA_ATTRIBUTE = {
  kind: 'media.kind',
  provider: 'media.provider',
  model: 'media.model',
  surface: 'media.surface',
  mode: 'media.mode',
  outcome: 'media.outcome',
  attempt: 'media.attempt',
  jobId: 'media.job_id',
  decision: 'media.safety_decision',
  reason: 'media.reason',
} as const;

interface Instruments {
  readonly generations: Counter;
  readonly generationDuration: Histogram;
  readonly attempts: Counter;
  readonly attemptDuration: Histogram;
  readonly callbacks: Counter;
  readonly polls: Counter;
  readonly safety: Counter;
}

let cached: {
  provider: ReturnType<typeof metrics.getMeterProvider>;
  instruments: Instruments;
} | null = null;

function instruments(): Instruments {
  const provider = metrics.getMeterProvider();
  if (cached?.provider === provider) return cached.instruments;
  const meter = provider.getMeter(TRACER_NAME);
  const created: Instruments = {
    generations: meter.createCounter(MEDIA_METRIC_NAME.generations),
    generationDuration: meter.createHistogram(MEDIA_METRIC_NAME.generationDuration, {
      unit: MILLISECONDS,
    }),
    attempts: meter.createCounter(MEDIA_METRIC_NAME.attempts),
    attemptDuration: meter.createHistogram(MEDIA_METRIC_NAME.attemptDuration, {
      unit: MILLISECONDS,
    }),
    callbacks: meter.createCounter(MEDIA_METRIC_NAME.callbacks),
    polls: meter.createCounter(MEDIA_METRIC_NAME.polls),
    safety: meter.createCounter(MEDIA_METRIC_NAME.safety),
  };
  cached = { provider, instruments: created };
  return created;
}

export function resetMediaInstrumentCache(): void {
  cached = null;
}

// A job id would give every media series unbounded cardinality, so it stays on
// the span and out of the metric attributes.
function clean(attributes: Readonly<Record<string, unknown>>): Attributes {
  const defined = Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null),
  );
  return scrubAttributes({ ...deploymentAttributes(), ...defined });
}

function nonNegative(durationMs: number | undefined): number {
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
    ? durationMs
    : 0;
}

export interface MediaGenerationMetric {
  readonly media: MediaKind;
  readonly outcome: MediaGenerationOutcome;
  readonly provider?: string;
  readonly model?: string;
  readonly surface?: string;
  readonly mode?: MediaGenerationMode;
  readonly latencyMs?: number;
}

export function recordMediaGeneration(input: MediaGenerationMetric): void {
  const attributes = clean({
    [MEDIA_ATTRIBUTE.kind]: input.media,
    [MEDIA_ATTRIBUTE.outcome]: input.outcome,
    [MEDIA_ATTRIBUTE.provider]: input.provider,
    [MEDIA_ATTRIBUTE.model]: input.model,
    [MEDIA_ATTRIBUTE.surface]: input.surface,
    [MEDIA_ATTRIBUTE.mode]: input.mode,
  });
  const recorded = instruments();
  recorded.generations.add(1, attributes);
  if (input.latencyMs !== undefined) {
    recorded.generationDuration.record(nonNegative(input.latencyMs), attributes);
  }
}

export interface MediaAttemptMetric {
  readonly media: MediaKind;
  readonly outcome: MediaAttemptOutcome;
  readonly attempt: number;
  readonly provider?: string;
  readonly model?: string;
  readonly latencyMs?: number;
}

export function recordMediaAttempt(input: MediaAttemptMetric): void {
  const attributes = clean({
    [MEDIA_ATTRIBUTE.kind]: input.media,
    [MEDIA_ATTRIBUTE.outcome]: input.outcome,
    [MEDIA_ATTRIBUTE.attempt]: input.attempt,
    [MEDIA_ATTRIBUTE.provider]: input.provider,
    [MEDIA_ATTRIBUTE.model]: input.model,
  });
  const recorded = instruments();
  recorded.attempts.add(1, attributes);
  if (input.latencyMs !== undefined) {
    recorded.attemptDuration.record(nonNegative(input.latencyMs), attributes);
  }
}

export function recordMediaCallback(input: {
  readonly media: MediaKind;
  readonly outcome: MediaCallbackOutcome;
  readonly provider?: string;
}): void {
  instruments().callbacks.add(
    1,
    clean({
      [MEDIA_ATTRIBUTE.kind]: input.media,
      [MEDIA_ATTRIBUTE.outcome]: input.outcome,
      [MEDIA_ATTRIBUTE.provider]: input.provider,
    }),
  );
}

export function recordMediaPoll(input: {
  readonly media: MediaKind;
  readonly outcome: MediaPollOutcome;
  readonly provider?: string;
}): void {
  instruments().polls.add(
    1,
    clean({
      [MEDIA_ATTRIBUTE.kind]: input.media,
      [MEDIA_ATTRIBUTE.outcome]: input.outcome,
      [MEDIA_ATTRIBUTE.provider]: input.provider,
    }),
  );
}

export function recordMediaSafety(input: {
  readonly media: MediaKind;
  readonly decision: MediaSafetyDecision;
  readonly reason: string;
  readonly surface?: string;
  readonly provider?: string;
}): void {
  instruments().safety.add(
    1,
    clean({
      [MEDIA_ATTRIBUTE.kind]: input.media,
      [MEDIA_ATTRIBUTE.decision]: input.decision,
      [MEDIA_ATTRIBUTE.reason]: input.reason,
      [MEDIA_ATTRIBUTE.surface]: input.surface,
      [MEDIA_ATTRIBUTE.provider]: input.provider,
    }),
  );
}

export interface MediaSpanAttributes {
  readonly media: MediaKind;
  readonly provider?: string;
  readonly model?: string;
  readonly surface?: string;
  readonly mode?: MediaGenerationMode;
  readonly jobId?: string;
  readonly attempt?: number;
}

function spanAttributes(input: MediaSpanAttributes): Record<string, unknown> {
  return {
    [MEDIA_ATTRIBUTE.kind]: input.media,
    [MEDIA_ATTRIBUTE.provider]: input.provider,
    [MEDIA_ATTRIBUTE.model]: input.model,
    [MEDIA_ATTRIBUTE.surface]: input.surface,
    [MEDIA_ATTRIBUTE.mode]: input.mode,
    [MEDIA_ATTRIBUTE.jobId]: input.jobId,
    [MEDIA_ATTRIBUTE.attempt]: input.attempt,
  };
}

export function withMediaJobSpan<R>(
  input: MediaSpanAttributes,
  fn: (span: ActiveSpan) => Promise<R> | R,
): Promise<R> {
  return withSpan(
    `media.${input.media}.generate`,
    { domain: MEDIA_SPAN_DOMAIN, kind: 'client', attributes: spanAttributes(input) },
    fn,
  );
}

export function withMediaAttemptSpan<R>(
  input: MediaSpanAttributes,
  fn: (span: ActiveSpan) => Promise<R> | R,
): Promise<R> {
  return withSpan(
    `media.${input.media}.attempt`,
    { domain: MEDIA_SPAN_DOMAIN, kind: 'client', attributes: spanAttributes(input) },
    fn,
  );
}

export const MEDIA_DIAGNOSTIC_HEADER = 'x-agi-media-trace-id';

export interface MediaJobDiagnostics {
  readonly media: MediaKind;
  readonly jobId: string;
  readonly status: string;
  readonly provider?: string;
  readonly model?: string;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly createdAtMs?: number;
  readonly settledAtMs?: number;
  readonly failureCode?: string;
}

export interface MediaJobDiagnosticsRecord extends MediaJobDiagnostics {
  readonly ageMs?: number;
  readonly latencyMs?: number;
}

/**
 * The support-facing view of one job: every field a diagnosis needs and none a
 * user supplied, so it is safe to log and to hand to a support surface.
 */
export function mediaJobDiagnostics(
  input: MediaJobDiagnostics,
  nowMs: number = Date.now(),
): MediaJobDiagnosticsRecord {
  const ageMs =
    input.createdAtMs === undefined ? undefined : Math.max(0, nowMs - input.createdAtMs);
  const latencyMs =
    input.createdAtMs === undefined || input.settledAtMs === undefined
      ? undefined
      : Math.max(0, input.settledAtMs - input.createdAtMs);
  return {
    ...input,
    ...(ageMs === undefined ? {} : { ageMs }),
    ...(latencyMs === undefined ? {} : { latencyMs }),
  };
}
