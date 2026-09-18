export type SloIndicatorKind = 'availability' | 'latency';

/** Dimensions an objective can be read along, not only in aggregate. */
export type SloSegment = 'region' | 'provider' | 'model';

export const SLO_SEGMENTS: readonly SloSegment[] = ['region', 'provider', 'model'];

export type SloSegmentColumns = Partial<Record<SloSegment, string>>;

export interface SloIndicatorSource {
  /** Unqualified table in the `public` schema the indicator is computed from. */
  table: string;
  occurredAt: string;
  /** Rows that belong in the denominator; anything else is not a sample. */
  eligible: string;
  /** Rows in the denominator that count as good. */
  good: string;
  /** Milliseconds a latency indicator is measured on, for the percentile read. */
  latencyMs?: string;
  /**
   * The column each segment reads. A segment the table does not carry is
   * absent rather than mapped to a constant: an objective split by a dimension
   * the rows never recorded reads as one bucket and hides the outlier.
   */
  segments?: SloSegmentColumns;
  coverage: string;
}

/**
 * `internal` is measured and alerted on but never published: the §90 list is a
 * commitment to customers, and the status and SLA pages render it verbatim.
 */
export type SloAudience = 'public' | 'internal';

export interface SloDefinition {
  id: string;
  domain: string;
  audience?: SloAudience;
  kind: SloIndicatorKind;
  /** The share of eligible events that must be good, as a fraction of one. */
  objective: number;
  windowDays: number;
  /** Latency indicators only: the deadline a good event must land inside. */
  thresholdMs?: number;
  statement: string;
  source: SloIndicatorSource | null;
  /** Why no indicator exists yet, for every definition whose source is null. */
  missingInstrument?: string;
}

const MONTHLY_WINDOW_DAYS = 30;

const SERVED_TURN = `kind = 'served'`;
const TERMINAL_TURN = `${SERVED_TURN} and outcome is not null`;

function analyticsSource(eventName: string, coverage: string): SloIndicatorSource {
  return {
    table: 'product_analytics_events',
    occurredAt: 'occurred_at',
    eligible: `event_name = '${eventName}' and outcome is not null`,
    good: `outcome = 'succeeded'`,
    coverage,
  };
}

/** routing_decision_traces carries all three dimensions on every served turn. */
const ROUTING_SEGMENTS: SloSegmentColumns = {
  region: 'region',
  provider: 'provider',
  model: 'model_key',
};

const ANALYTICS_COVERAGE =
  'Accounts that granted the product analytics purpose. Consent is read per event, so an account that refused it is absent from both sides of the ratio.';

/**
 * The §90 service levels, each one either measured from a named production
 * table or declared with the instrument it is still missing. Nothing else may
 * state an objective: the public pages, the burn-rate alerting and the tests
 * all read this list, so a target cannot drift from what is measured.
 */
export const SLO_CATALOGUE: readonly SloDefinition[] = [
  {
    id: 'authentication',
    domain: 'Authentication',
    kind: 'availability',
    objective: 0.999,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'Sign-in and session verification succeed when the identity provider is reachable.',
    source: {
      table: 'authentication_attempts',
      occurredAt: 'occurred_at',
      eligible: `outcome = any (array['succeeded', 'failed'])`,
      good: `outcome = 'succeeded'`,
      latencyMs: 'duration_ms',
      segments: { region: 'region', provider: 'provider' },
      coverage:
        "Verification attempts the product made against the identity provider. A rejected credential is recorded as 'rejected' and is not a sample: refusing a wrong password is the product working, not an outage.",
    },
  },
  {
    id: 'chat',
    domain: 'Chat',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A served chat turn reaches a completed response.',
    source: {
      table: 'routing_decision_traces',
      occurredAt: 'created_at',
      eligible: TERMINAL_TURN,
      good: `outcome = 'succeeded'`,
      segments: ROUTING_SEGMENTS,
      coverage:
        'Every served turn the router traced, on every surface. Shadow turns are excluded: they are never delivered to anyone.',
    },
  },
  {
    id: 'first-token',
    domain: 'First token',
    kind: 'latency',
    objective: 0.95,
    windowDays: MONTHLY_WINDOW_DAYS,
    thresholdMs: 3_000,
    statement: 'A served turn starts streaming within the deadline.',
    source: {
      table: 'routing_decision_traces',
      occurredAt: 'created_at',
      eligible: `${SERVED_TURN} and ttft_ms is not null`,
      good: 'ttft_ms <= $3',
      latencyMs: 'ttft_ms',
      segments: ROUTING_SEGMENTS,
      coverage: 'Served turns whose first token the router timed.',
    },
  },
  {
    id: 'completion',
    domain: 'Completion',
    kind: 'latency',
    objective: 0.95,
    windowDays: MONTHLY_WINDOW_DAYS,
    thresholdMs: 120_000,
    statement: 'A served turn finishes within the deadline.',
    source: {
      table: 'routing_decision_traces',
      occurredAt: 'created_at',
      eligible: `${SERVED_TURN} and duration_ms is not null`,
      good: 'duration_ms <= $3',
      latencyMs: 'duration_ms',
      segments: ROUTING_SEGMENTS,
      coverage: 'Served turns the router timed to completion.',
    },
  },
  {
    id: 'tool-execution',
    domain: 'Tool execution',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A tool call the assistant makes returns a result rather than an error.',
    source: {
      table: 'agent_tool_executions',
      occurredAt: 'created_at',
      eligible: 'true',
      good: 'success',
      latencyMs: 'duration_ms',
      coverage: 'Tool calls executed by the hosted agent runtime.',
    },
  },
  {
    id: 'work',
    domain: 'Work',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A queued job reaches a successful terminal state instead of the dead letter queue.',
    source: {
      table: 'background_jobs',
      occurredAt: 'created_at',
      eligible: `status = any (array['succeeded', 'dead'])`,
      good: `status = 'succeeded'`,
      coverage:
        'Jobs that reached a terminal state in the window. A job still queued or running is not yet a sample.',
    },
  },
  {
    id: 'research',
    domain: 'Research',
    kind: 'availability',
    objective: 0.95,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A research run reaches a finished report.',
    source: {
      table: 'research_reports',
      occurredAt: 'created_at',
      eligible: `status = any (array['completed', 'failed', 'interrupted'])`,
      good: `status = 'completed'`,
      latencyMs: 'duration_ms',
      coverage: 'Research runs that reached a terminal status in the window.',
    },
  },
  {
    id: 'file-upload',
    domain: 'File upload',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A file the user attaches is stored.',
    source: analyticsSource('file_uploaded', ANALYTICS_COVERAGE),
  },
  {
    id: 'file-parsing',
    domain: 'File parsing',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A stored file is parsed into text the model can read.',
    source: analyticsSource('file_processed', ANALYTICS_COVERAGE),
  },
  {
    id: 'search',
    domain: 'Search',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A search returns results rather than an error.',
    source: {
      table: 'search_history',
      occurredAt: 'created_at',
      eligible: 'outcome is not null',
      good: `outcome = 'succeeded'`,
      latencyMs: 'duration_ms',
      segments: { region: 'region', provider: 'provider' },
      coverage:
        'Searches that recorded an outcome. A search that matched nothing is a successful search; only a search that failed to run is a bad sample.',
    },
  },
  {
    id: 'remote-control',
    domain: 'Remote control',
    kind: 'availability',
    objective: 0.95,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A remote action reaches the paired device and reports its result.',
    source: analyticsSource('remote_action_finished', ANALYTICS_COVERAGE),
  },
  {
    id: 'browser',
    domain: 'Browser',
    kind: 'availability',
    objective: 0.95,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A browser action completes on the page it was aimed at.',
    source: analyticsSource('browser_action_finished', ANALYTICS_COVERAGE),
  },
  {
    id: 'notifications',
    domain: 'Notifications',
    kind: 'availability',
    objective: 0.99,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A notification the product raises reaches the account it was raised for.',
    source: null,
    missingInstrument:
      'Notification rows record what was raised, not whether delivery succeeded, and the push sender discards the per-subscription result once it has pruned dead subscriptions.',
  },
  {
    id: 'billing-events',
    domain: 'Billing events',
    kind: 'availability',
    objective: 0.999,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'A billing event from the payment provider is processed without error.',
    source: {
      table: 'processed_stripe_events',
      occurredAt: 'processed_at',
      eligible: 'true',
      good: `status = 'succeeded'`,
      coverage:
        'Webhook events the billing provider delivered. An event the provider never delivered cannot appear here.',
    },
  },
  {
    id: 'billing-usage',
    domain: 'Billing usage',
    audience: 'internal',
    kind: 'availability',
    objective: 0.999,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'Usage a request consumed is settled against the account that consumed it.',
    source: {
      table: 'managed_usage_requests',
      occurredAt: 'created_at',
      eligible: 'final_settlement_status is not null',
      good: `final_settlement_status = 'succeeded'`,
      coverage:
        'Metered requests whose settlement reached a decision. A request still holding a reservation is not yet a sample; a settlement that gave up is a failed one.',
    },
  },
  {
    id: 'entitlement-activation',
    domain: 'Entitlement activation',
    audience: 'internal',
    kind: 'availability',
    objective: 0.999,
    windowDays: MONTHLY_WINDOW_DAYS,
    statement: 'What an account paid for is granted to it.',
    source: {
      table: 'credit_settlement_jobs',
      occurredAt: 'created_at',
      eligible: `status = any (array['succeeded', 'terminal'])`,
      good: `status = 'succeeded'`,
      coverage:
        'Grants that reached a terminal state. A grant still retrying is not yet a sample, and a terminal one is money taken without the entitlement it bought.',
    },
  },
];

export function isPublishedSlo(slo: SloDefinition): boolean {
  return slo.audience !== 'internal';
}

export function publishedSlos(): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter(isPublishedSlo);
}

export function measuredSlos(): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter((slo) => slo.source !== null && isPublishedSlo(slo));
}

export function declaredOnlySlos(): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter((slo) => slo.source === null && isPublishedSlo(slo));
}

/** Every indicator with a source, published or not: alerting sees them all. */
export function alertableSlos(): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter((slo) => slo.source !== null);
}

export function findSlo(id: string): SloDefinition | undefined {
  return SLO_CATALOGUE.find((slo) => slo.id === id);
}

export function segmentColumn(slo: SloDefinition, segment: SloSegment): string | undefined {
  return slo.source?.segments?.[segment];
}

export function segmentsOf(slo: SloDefinition): readonly SloSegment[] {
  return SLO_SEGMENTS.filter((segment) => segmentColumn(slo, segment) !== undefined);
}

export function segmentableSlos(segment: SloSegment): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter((slo) => segmentColumn(slo, segment) !== undefined);
}

const PERCENT = 100;
const OBJECTIVE_DECIMALS = 3;

export function formatObjective(objective: number): string {
  const percent = objective * PERCENT;
  return `${Number(percent.toFixed(OBJECTIVE_DECIMALS))}%`;
}
