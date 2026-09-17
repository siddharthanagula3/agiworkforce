export type SloIndicatorKind = 'availability' | 'latency';

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
  coverage: string;
}

export interface SloDefinition {
  id: string;
  domain: string;
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
    source: null,
    missingInstrument:
      'Authentication runs in the identity provider and in the request proxy, neither of which writes a per-attempt outcome row. The failures recorded in security_audit_logs are rejected credentials, which are the product working, not an outage.',
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
    source: null,
    missingInstrument:
      'search_history records the query and how many results came back, never whether the search itself failed, so a failed search and a search with no matches are the same row.',
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
];

export function measuredSlos(): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter((slo) => slo.source !== null);
}

export function declaredOnlySlos(): readonly SloDefinition[] {
  return SLO_CATALOGUE.filter((slo) => slo.source === null);
}

export function findSlo(id: string): SloDefinition | undefined {
  return SLO_CATALOGUE.find((slo) => slo.id === id);
}

const PERCENT = 100;
const OBJECTIVE_DECIMALS = 3;

export function formatObjective(objective: number): string {
  const percent = objective * PERCENT;
  return `${Number(percent.toFixed(OBJECTIVE_DECIMALS))}%`;
}
