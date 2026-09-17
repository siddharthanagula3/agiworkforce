export const PRODUCT_ANALYTICS_CONSENT_PURPOSE = 'product_analytics';

export const PRODUCT_ANALYTICS_INGEST_PATH = '/api/analytics/events';

export const PRODUCT_ANALYTICS_MAX_BATCH = 50;

export const PRODUCT_ANALYTICS_SURFACES = [
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
  'api',
] as const;

export type ProductAnalyticsSurface = (typeof PRODUCT_ANALYTICS_SURFACES)[number];

export const PRODUCT_ANALYTICS_OUTCOMES = [
  'succeeded',
  'failed',
  'cancelled',
  'accepted',
  'dismissed',
] as const;

export type ProductAnalyticsOutcome = (typeof PRODUCT_ANALYTICS_OUTCOMES)[number];

export const PRODUCT_ANALYTICS_EVENT_NAMES = [
  'signup',
  'activation',
  'first_chat',
  'first_useful_response',
  'file_uploaded',
  'project_created',
  'library_item_opened',
  'research_started',
  'work_started',
  'code_session_started',
  'connector_connected',
  'skill_installed',
  'plugin_installed',
  'remote_session_started',
  'browser_session_started',
  'voice_session_started',
  'plan_changed',
  'assistant_response',
  'response_regenerated',
  'generation_stopped',
  'tool_call',
  'citation_rendered',
  'file_processed',
  'code_suggestion_resolved',
  'work_run_finished',
  'research_run_finished',
  'browser_action_finished',
  'remote_action_finished',
] as const;

export type ProductAnalyticsEventName = (typeof PRODUCT_ANALYTICS_EVENT_NAMES)[number];

/**
 * Events whose row is meaningless without an outcome: every quality rate in
 * §102 is a ratio over one of these, so an event that arrives without one
 * would silently move the denominator and not the numerator.
 */
export const PRODUCT_ANALYTICS_OUTCOME_EVENTS = [
  'tool_call',
  'citation_rendered',
  'file_processed',
  'code_suggestion_resolved',
  'work_run_finished',
  'research_run_finished',
  'browser_action_finished',
  'remote_action_finished',
] as const;

export type ProductAnalyticsOutcomeEventName = (typeof PRODUCT_ANALYTICS_OUTCOME_EVENTS)[number];

/**
 * The only property keys an event may carry. Free-form properties are how an
 * analytics pipeline ends up holding prompts, file names and email addresses,
 * so the contract is an allowlist of low-cardinality dimensions and the ingest
 * drops everything else.
 */
export const PRODUCT_ANALYTICS_PROPERTY_KEYS = [
  'attempt',
  'capability',
  'errorCode',
  'kind',
  'planTier',
  'previousPlanTier',
  'provider',
  'source',
  'toolName',
] as const;

export type ProductAnalyticsPropertyKey = (typeof PRODUCT_ANALYTICS_PROPERTY_KEYS)[number];

export const PRODUCT_ANALYTICS_PROPERTY_MAX_LENGTH = 120;

export type ProductAnalyticsProperties = Partial<
  Record<ProductAnalyticsPropertyKey, string | number | boolean>
>;

export interface ProductAnalyticsEvent {
  readonly name: ProductAnalyticsEventName;
  readonly surface: ProductAnalyticsSurface;
  readonly occurredAt: string;
  readonly outcome?: ProductAnalyticsOutcome;
  readonly properties?: ProductAnalyticsProperties;
}

const EVENT_NAMES: ReadonlySet<string> = new Set(PRODUCT_ANALYTICS_EVENT_NAMES);
const SURFACES: ReadonlySet<string> = new Set(PRODUCT_ANALYTICS_SURFACES);
const OUTCOMES: ReadonlySet<string> = new Set(PRODUCT_ANALYTICS_OUTCOMES);
const OUTCOME_EVENTS: ReadonlySet<string> = new Set(PRODUCT_ANALYTICS_OUTCOME_EVENTS);
const PROPERTY_KEYS: ReadonlySet<string> = new Set(PRODUCT_ANALYTICS_PROPERTY_KEYS);

export function isProductAnalyticsEventName(value: unknown): value is ProductAnalyticsEventName {
  return typeof value === 'string' && EVENT_NAMES.has(value);
}

export function isProductAnalyticsSurface(value: unknown): value is ProductAnalyticsSurface {
  return typeof value === 'string' && SURFACES.has(value);
}

export function isProductAnalyticsOutcome(value: unknown): value is ProductAnalyticsOutcome {
  return typeof value === 'string' && OUTCOMES.has(value);
}

export function requiresProductAnalyticsOutcome(
  name: ProductAnalyticsEventName,
): name is ProductAnalyticsOutcomeEventName {
  return OUTCOME_EVENTS.has(name);
}

function normalizeProperties(value: unknown): ProductAnalyticsProperties | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const properties: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!PROPERTY_KEYS.has(key)) continue;
    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) properties[key] = raw;
      continue;
    }
    if (typeof raw === 'boolean') {
      properties[key] = raw;
      continue;
    }
    if (typeof raw === 'string' && raw.length > 0) {
      properties[key] = raw.slice(0, PRODUCT_ANALYTICS_PROPERTY_MAX_LENGTH);
    }
  }
  return Object.keys(properties).length > 0 ? properties : undefined;
}

/**
 * Returns the event as it may be stored, or null. Everything a caller cannot
 * be trusted to get right, an unknown name, a bogus timestamp, an outcome an
 * event has no business carrying, fails here rather than downstream of the
 * consent gate.
 */
export function normalizeProductAnalyticsEvent(value: unknown): ProductAnalyticsEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;

  const { name, surface } = candidate;
  if (!isProductAnalyticsEventName(name) || !isProductAnalyticsSurface(surface)) return null;

  const occurredAtRaw = candidate['occurredAt'];
  const occurredAtMs =
    typeof occurredAtRaw === 'string' || typeof occurredAtRaw === 'number'
      ? new Date(occurredAtRaw).getTime()
      : Number.NaN;
  if (!Number.isFinite(occurredAtMs)) return null;

  const outcomeRaw = candidate['outcome'];
  const outcome = isProductAnalyticsOutcome(outcomeRaw) ? outcomeRaw : undefined;
  if (requiresProductAnalyticsOutcome(name) && !outcome) return null;
  if (!requiresProductAnalyticsOutcome(name) && outcomeRaw !== undefined && !outcome) return null;

  const properties = normalizeProperties(candidate['properties']);

  return {
    name,
    surface,
    occurredAt: new Date(occurredAtMs).toISOString(),
    ...(outcome ? { outcome } : {}),
    ...(properties ? { properties } : {}),
  };
}

export interface ProductAnalyticsEmitterOptions {
  readonly surface: ProductAnalyticsSurface;
  readonly send: (events: readonly ProductAnalyticsEvent[]) => void | Promise<void>;
  readonly isAllowed: () => boolean;
  readonly batchSize?: number;
  readonly now?: () => number;
}

export interface ProductAnalyticsEmitter {
  track(
    name: ProductAnalyticsEventName,
    input?: { outcome?: ProductAnalyticsOutcome; properties?: ProductAnalyticsProperties },
  ): void;
  flush(): Promise<void>;
  pending(): number;
}

/**
 * The shape every surface shares: the consent question and the batching are
 * the same everywhere, only the transport differs, so each surface supplies
 * `send` and keeps the one it already has.
 */
export function createProductAnalyticsEmitter(
  options: ProductAnalyticsEmitterOptions,
): ProductAnalyticsEmitter {
  const batchSize = Math.min(
    options.batchSize ?? PRODUCT_ANALYTICS_MAX_BATCH,
    PRODUCT_ANALYTICS_MAX_BATCH,
  );
  const now = options.now ?? Date.now;
  let queue: ProductAnalyticsEvent[] = [];

  async function flush(): Promise<void> {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    if (!options.isAllowed()) return;
    await options.send(batch);
  }

  return {
    track(name, input) {
      if (!options.isAllowed()) return;
      const event = normalizeProductAnalyticsEvent({
        name,
        surface: options.surface,
        occurredAt: new Date(now()).toISOString(),
        outcome: input?.outcome,
        properties: input?.properties,
      });
      if (!event) return;
      queue.push(event);
      if (queue.length >= batchSize) void flush();
    },
    flush,
    pending: () => queue.length,
  };
}

export const PRODUCT_METRIC_KEYS = [
  'dau',
  'wau',
  'mau',
  'retention_d1',
  'retention_d7',
  'retention_d30',
  'paid_conversion',
  'churn',
  'expansion',
  'arr_microusd',
  'arpu_microusd',
  'gross_margin',
  'support_cost_microusd',
  'paid_subscribers',
  'regenerate_rate',
  'stop_rate',
  'tool_failure_rate',
  'tool_retry_rate',
  'citation_failure_rate',
  'file_failure_rate',
  'code_acceptance_rate',
  'work_completion_rate',
  'research_completion_rate',
  'browser_success_rate',
  'remote_success_rate',
] as const;

export type ProductMetricKey = (typeof PRODUCT_METRIC_KEYS)[number];

export interface ProductMetricValue {
  readonly metric: ProductMetricKey;
  readonly value: number | null;
  readonly numerator: number;
  readonly denominator: number;
}
