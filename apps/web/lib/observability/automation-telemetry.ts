import { metrics, type Attributes, type Counter, type Histogram } from '@opentelemetry/api';
import { scrubAttributes } from '@agiworkforce/observability';
import {
  summarizeAutomationOutcomes,
  type AutomationOutcome,
  type AutomationOutcomeSummary,
} from '@agiworkforce/types';

import { deploymentAttributes } from './attributes';
import { TRACER_NAME } from './otel-span-bridge';

export const AUTOMATION_METRIC_NAME = {
  outcomes: 'agi.automation.outcomes',
  outcomeDuration: 'agi.automation.outcome.duration',
  unverified: 'agi.automation.unverified',
} as const;

export const AUTOMATION_ATTRIBUTE = {
  action: 'automation.action',
  surface: 'automation.surface',
  session: 'automation.session_kind',
  status: 'automation.status',
  verified: 'automation.verified',
} as const;

const MILLISECONDS = 'ms';

interface Instruments {
  readonly outcomes: Counter;
  readonly outcomeDuration: Histogram;
  readonly unverified: Counter;
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
    outcomes: meter.createCounter(AUTOMATION_METRIC_NAME.outcomes),
    outcomeDuration: meter.createHistogram(AUTOMATION_METRIC_NAME.outcomeDuration, {
      unit: MILLISECONDS,
    }),
    unverified: meter.createCounter(AUTOMATION_METRIC_NAME.unverified),
  };
  cached = { provider, instruments: created };
  return created;
}

export function resetAutomationInstrumentCache(): void {
  cached = null;
}

// A device id and a run id are unbounded, so they stay on the span and out of
// the metric attributes. The reason is free text and never becomes one.
function clean(attributes: Readonly<Record<string, unknown>>): Attributes {
  const defined = Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null),
  );
  return scrubAttributes({ ...deploymentAttributes(), ...defined });
}

function metricAttributes(outcome: AutomationOutcome): Attributes {
  return clean({
    [AUTOMATION_ATTRIBUTE.action]: outcome.action,
    [AUTOMATION_ATTRIBUTE.surface]: outcome.surface,
    [AUTOMATION_ATTRIBUTE.session]: outcome.sessionKind,
    [AUTOMATION_ATTRIBUTE.status]: outcome.status,
    [AUTOMATION_ATTRIBUTE.verified]: outcome.verified,
  });
}

/**
 * The one way a browser or computer-use receipt becomes a metric. An unverified
 * success claim is counted separately so a surface that stops checking its work
 * shows up as a regression rather than as a steady success rate.
 */
export function recordAutomationOutcome(outcome: AutomationOutcome): void {
  const attributes = metricAttributes(outcome);
  const recorded = instruments();
  recorded.outcomes.add(1, attributes);
  recorded.outcomeDuration.record(Math.max(0, outcome.durationMs), attributes);
  if (outcome.verification !== null && !outcome.verified) {
    recorded.unverified.add(1, attributes);
  }
}

export function recordAutomationOutcomes(outcomes: readonly AutomationOutcome[]): number {
  for (const outcome of outcomes) recordAutomationOutcome(outcome);
  return outcomes.length;
}

export interface AutomationDiagnostics {
  readonly runId: string;
  readonly deviceId: string | null;
  readonly summary: AutomationOutcomeSummary;
  readonly lastFailureReason: string | null;
}

/**
 * The support-facing view of one run: counts, success rate and the last reason
 * a step gave, with no page content and nothing a user typed.
 */
export function automationRunDiagnostics(
  runId: string,
  outcomes: readonly AutomationOutcome[],
): AutomationDiagnostics {
  const failures = outcomes.filter(
    (outcome) => outcome.status === 'failed' || outcome.status === 'refused',
  );
  return {
    runId,
    deviceId: outcomes.find((outcome) => outcome.deviceId !== null)?.deviceId ?? null,
    summary: summarizeAutomationOutcomes(outcomes),
    lastFailureReason: failures.at(-1)?.reason ?? null,
  };
}
