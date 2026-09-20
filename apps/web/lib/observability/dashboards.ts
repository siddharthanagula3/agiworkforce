import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { LOCAL_METRIC_LABEL } from './cardinality';
import { MEDIA_ATTRIBUTE } from './media-telemetry';
import { METRIC_NAME } from './metrics';

export type DashboardMetric = (typeof METRIC_NAME)[keyof typeof METRIC_NAME];

export type PanelAggregation = 'rate' | 'ratio' | 'p50' | 'p95' | 'p99' | 'max';

export interface DashboardPanel {
  readonly id: string;
  readonly title: string;
  readonly metric: DashboardMetric;
  readonly aggregation: PanelAggregation;
  readonly groupBy: readonly string[];
  readonly match?: Readonly<Record<string, string>>;
  readonly of?: Readonly<Record<string, string>>;
}

export interface ServiceDashboard {
  readonly id: string;
  readonly title: string;
  readonly panels: readonly DashboardPanel[];
}

const RATE_WINDOW = '5m';
const HISTOGRAM_QUANTILE: Readonly<Record<'p50' | 'p95' | 'p99', string>> = {
  p50: '0.5',
  p95: '0.95',
  p99: '0.99',
};

export const SERVICE_DASHBOARDS: readonly ServiceDashboard[] = [
  {
    id: 'http-traffic',
    title: 'HTTP traffic',
    panels: [
      {
        id: 'request-rate',
        title: 'Request rate',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'rate',
        groupBy: ['http_request_method'],
      },
      {
        id: 'error-rate',
        title: 'Error rate',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'ratio',
        groupBy: ['http_request_method'],
        match: { error_type: '5xx' },
      },
      {
        id: 'request-latency-p95',
        title: 'Request latency p95',
        metric: METRIC_NAME.httpDuration,
        aggregation: 'p95',
        groupBy: ['http_request_method'],
      },
      // p95 hides the tail a p99 shows: the slowest one request in a hundred is
      // where a timeout budget is actually spent.
      {
        id: 'request-latency-p99',
        title: 'Request latency p99',
        metric: METRIC_NAME.httpDuration,
        aggregation: 'p99',
        groupBy: ['http_request_method'],
      },
    ],
  },
  {
    id: 'browser-health',
    title: 'Browser health',
    panels: [
      {
        id: 'browser-task-rate',
        title: 'Browser task rate',
        metric: METRIC_NAME.browserTasks,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.surface)],
      },
      {
        id: 'browser-task-failure-ratio',
        title: 'Browser task failure ratio',
        metric: METRIC_NAME.browserTasks,
        aggregation: 'ratio',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.surface)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.browserTaskStatus)]: 'failed' },
      },
    ],
  },
  {
    id: 'notification-delivery',
    title: 'Notification delivery',
    panels: [
      {
        id: 'notification-send-rate',
        title: 'Notification send rate',
        metric: METRIC_NAME.notificationDeliveries,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.notificationChannel)],
      },
      {
        id: 'notification-delivered-ratio',
        title: 'Delivered share of attempts',
        metric: METRIC_NAME.notificationDeliveries,
        aggregation: 'ratio',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.notificationChannel)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.notificationOutcome)]: 'delivered' },
        of: { [attributeKey(OBSERVABILITY_ATTRIBUTE.notificationOutcome)]: 'delivered|failed' },
      },
    ],
  },
  {
    id: 'failures',
    title: 'Failures by kind',
    panels: [
      {
        id: 'failure-rate',
        title: 'Failure rate',
        metric: METRIC_NAME.failures,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.failureKind)],
      },
    ],
  },
  {
    id: 'release-health',
    title: 'Release health',
    panels: [
      {
        id: 'error-rate-by-release',
        title: 'Error rate by release',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'ratio',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.deploymentEnvironment),
        ],
        match: { error_type: '5xx' },
      },
      {
        id: 'crash-rate-by-release',
        title: 'Crash rate by release',
        metric: METRIC_NAME.failures,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.failureKind),
        ],
      },
      {
        id: 'traffic-by-client-version',
        title: 'Traffic by client version',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.clientVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.surface),
        ],
      },
      {
        id: 'latency-p95-by-release',
        title: 'Request latency p95 by release',
        metric: METRIC_NAME.httpDuration,
        aggregation: 'p95',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion)],
      },
      {
        id: 'latency-p99-by-release',
        title: 'Request latency p99 by release',
        metric: METRIC_NAME.httpDuration,
        aggregation: 'p99',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion)],
      },
      {
        id: 'configuration-completeness',
        title: 'Configuration completeness',
        metric: METRIC_NAME.configurationState,
        aggregation: 'max',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.configurationComponent),
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
        ],
      },
    ],
  },
  {
    id: 'job-health',
    title: 'Background job health',
    panels: [
      {
        id: 'queue-age',
        title: 'Oldest queued job age',
        metric: METRIC_NAME.queueAge,
        aggregation: 'max',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.queueName)],
      },
      {
        id: 'stuck-jobs',
        title: 'Jobs holding an unrenewed lease',
        metric: METRIC_NAME.queueStuck,
        aggregation: 'max',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.queueName)],
      },
    ],
  },
  {
    id: 'provider-and-model',
    title: 'Provider and model',
    panels: [
      {
        id: 'turn-rate-by-provider-model',
        title: 'Turns by provider and model',
        metric: METRIC_NAME.routingDecisions,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.providerName),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
      },
      {
        id: 'no-route-ratio-by-provider-model',
        title: 'Share with no route, by provider and model',
        metric: METRIC_NAME.routingDecisions,
        aggregation: 'ratio',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.providerName),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.routingStatus)]: 'unavailable' },
      },
      {
        id: 'span-latency-p99-by-provider',
        title: 'Span latency p99 by provider',
        metric: METRIC_NAME.spanDuration,
        aggregation: 'p99',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.providerName)],
      },
    ],
  },
  {
    id: 'completion-truth',
    title: 'Completion truth',
    panels: [
      {
        id: 'false-success-rate',
        title: 'Completions reported as success that were not',
        metric: METRIC_NAME.falseSuccess,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.completionKind),
          attributeKey(OBSERVABILITY_ATTRIBUTE.completionReason),
        ],
      },
      {
        id: 'completion-status-rate',
        title: 'Completions by resolved status',
        metric: METRIC_NAME.completions,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.completionStatus),
          attributeKey(OBSERVABILITY_ATTRIBUTE.surface),
        ],
      },
      {
        id: 'tool-latency-p99',
        title: 'Tool latency p99 by category',
        metric: METRIC_NAME.toolDuration,
        aggregation: 'p99',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.toolCategory)],
      },
    ],
  },
  {
    id: 'media-generation',
    title: 'Media generation',
    panels: [
      {
        id: 'media-generation-rate',
        title: 'Generations by kind and provider',
        metric: METRIC_NAME.mediaGenerations,
        aggregation: 'rate',
        groupBy: [attributeKey(MEDIA_ATTRIBUTE.kind), attributeKey(MEDIA_ATTRIBUTE.provider)],
      },
      {
        id: 'media-generation-failure-ratio',
        title: 'Failed share of generations',
        metric: METRIC_NAME.mediaGenerations,
        aggregation: 'ratio',
        groupBy: [attributeKey(MEDIA_ATTRIBUTE.kind), attributeKey(MEDIA_ATTRIBUTE.provider)],
        match: { [attributeKey(MEDIA_ATTRIBUTE.outcome)]: 'failed' },
      },
      {
        id: 'media-generation-latency-p95',
        title: 'Generation latency p95',
        metric: METRIC_NAME.mediaGenerationDuration,
        aggregation: 'p95',
        groupBy: [attributeKey(MEDIA_ATTRIBUTE.kind)],
      },
      {
        id: 'media-generation-latency-p99',
        title: 'Generation latency p99',
        metric: METRIC_NAME.mediaGenerationDuration,
        aggregation: 'p99',
        groupBy: [attributeKey(MEDIA_ATTRIBUTE.kind)],
      },
      {
        id: 'media-poll-rate',
        title: 'Job polls by outcome',
        metric: METRIC_NAME.mediaPolls,
        aggregation: 'rate',
        groupBy: [attributeKey(MEDIA_ATTRIBUTE.kind), attributeKey(MEDIA_ATTRIBUTE.outcome)],
      },
      // A provider callback that stops arriving is invisible in the generation
      // rate: the job simply stays open until the poller settles it.
      {
        id: 'media-callback-rate',
        title: 'Provider callbacks by outcome',
        metric: METRIC_NAME.mediaCallbacks,
        aggregation: 'rate',
        groupBy: [attributeKey(MEDIA_ATTRIBUTE.kind), attributeKey(MEDIA_ATTRIBUTE.outcome)],
      },
    ],
  },
  {
    id: 'security-and-identity',
    title: 'Security and identity',
    panels: [
      // An authentication outage and a workspace locking itself out look the
      // same in the request rate and different here: one is a 5xx, the other a
      // policy layer doing its job.
      {
        id: 'auth-error-rate',
        title: 'Authentication error rate',
        metric: METRIC_NAME.failures,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.errorType)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.failureKind)]: 'api' },
      },
      {
        id: 'policy-denial-rate',
        title: 'Policy and entitlement denials',
        metric: METRIC_NAME.denials,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.denialReason)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer)]: 'policy|entitlement' },
      },
      {
        id: 'identity-configuration-state',
        title: 'Identity configuration state',
        metric: METRIC_NAME.configurationState,
        aggregation: 'max',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.configurationComponent)],
      },
      {
        id: 'identity-latency-p95',
        title: 'Identity request latency p95',
        metric: METRIC_NAME.httpDuration,
        aggregation: 'p95',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.surface)],
      },
    ],
  },
  {
    id: 'connector-health',
    title: 'Connector and extension health',
    panels: [
      {
        id: 'connector-failure-rate',
        title: 'Connector failures',
        metric: METRIC_NAME.failures,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.errorType)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.failureKind)]: 'connector|mcp' },
      },
      {
        id: 'connector-call-rate',
        title: 'Connector calls by category and status',
        metric: METRIC_NAME.toolCalls,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.toolCategory),
          attributeKey(OBSERVABILITY_ATTRIBUTE.toolStatus),
        ],
      },
      {
        id: 'connector-latency-p95',
        title: 'Connector latency p95',
        metric: METRIC_NAME.toolDuration,
        aggregation: 'p95',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.toolCategory)],
      },
      {
        id: 'connector-denial-rate',
        title: 'Connector calls refused by a capability gate',
        metric: METRIC_NAME.denials,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.denialReason)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer)]: 'capability' },
      },
    ],
  },
  {
    id: 'foundation-traffic',
    title: 'Foundation traffic',
    panels: [
      {
        id: 'requests-by-surface',
        title: 'Requests by surface',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.surface)],
      },
      {
        id: 'client-version-distribution',
        title: 'Client-version distribution',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.clientVersion)],
      },
      {
        id: 'protocol-version-distribution',
        title: 'Protocol-version distribution',
        metric: METRIC_NAME.httpRequests,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.protocolVersion)],
      },
      {
        id: 'turns-by-mode',
        title: 'Turns by mode and trust mode',
        metric: METRIC_NAME.turns,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestMode),
          attributeKey(OBSERVABILITY_ATTRIBUTE.trustMode),
        ],
      },
      {
        id: 'turns-by-workspace-kind',
        title: 'Turns by workspace kind',
        metric: METRIC_NAME.turns,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.workspaceKind),
          attributeKey(OBSERVABILITY_ATTRIBUTE.surface),
        ],
      },
    ],
  },
  {
    id: 'refusals-and-rejections',
    title: 'Refusals and rejections',
    panels: [
      {
        id: 'denial-rate-by-layer',
        title: 'Denials by layer and reason',
        metric: METRIC_NAME.denials,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer),
          attributeKey(OBSERVABILITY_ATTRIBUTE.denialReason),
        ],
      },
      {
        id: 'denial-rate-by-surface',
        title: 'Denials by surface',
        metric: METRIC_NAME.denials,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.surface),
          attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer),
        ],
      },
      {
        id: 'unsupported-surface-attempts',
        title: 'Attempts on a surface that does not support the feature',
        metric: METRIC_NAME.denials,
        aggregation: 'rate',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.surface)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.denialLayer)]: 'surface' },
      },
      {
        id: 'rejection-rate-by-kind',
        title: 'Rejections by kind',
        metric: METRIC_NAME.rejections,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.rejectionKind),
          attributeKey(OBSERVABILITY_ATTRIBUTE.surface),
        ],
      },
      // A decoding failure that only one build sees is a contract the release
      // broke, not a bug in the request: the client version is the first cut.
      {
        id: 'rejection-rate-by-client-version',
        title: 'Rejections by client version',
        metric: METRIC_NAME.rejections,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.clientVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.rejectionKind),
        ],
      },
    ],
  },
  {
    id: 'turn-latency-and-cost',
    title: 'Turn latency and cost',
    panels: [
      {
        id: 'ttft-p50',
        title: 'Time to first token p50',
        metric: METRIC_NAME.turnTimeToFirstToken,
        aggregation: 'p50',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      {
        id: 'ttft-p95',
        title: 'Time to first token p95',
        metric: METRIC_NAME.turnTimeToFirstToken,
        aggregation: 'p95',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      {
        id: 'ttft-p99',
        title: 'Time to first token p99',
        metric: METRIC_NAME.turnTimeToFirstToken,
        aggregation: 'p99',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      {
        id: 'turn-wall-time-p95',
        title: 'Turn wall time p95',
        metric: METRIC_NAME.turnDuration,
        aggregation: 'p95',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      {
        id: 'turn-wall-time-p99',
        title: 'Turn wall time p99',
        metric: METRIC_NAME.turnDuration,
        aggregation: 'p99',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      {
        id: 'turn-cost-p50',
        title: 'Cost per turn p50',
        metric: METRIC_NAME.turnCost,
        aggregation: 'p50',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      {
        id: 'turn-cost-p99',
        title: 'Cost per turn p99',
        metric: METRIC_NAME.turnCost,
        aggregation: 'p99',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
      },
      // A cache that stops being read does not fail anything: the only place it
      // shows is the hit share, and after it the cost per turn.
      {
        id: 'prompt-cache-hit-ratio',
        title: 'Prompt cache hit share',
        metric: METRIC_NAME.turns,
        aggregation: 'ratio',
        groupBy: [attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel)],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.cacheOutcome)]: 'hit' },
        of: { [attributeKey(OBSERVABILITY_ATTRIBUTE.cacheOutcome)]: 'hit|miss' },
      },
      {
        id: 'turn-retry-rate',
        title: 'Retries per turn',
        metric: METRIC_NAME.turnRetries,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.providerName),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
      },
      {
        id: 'turn-failure-ratio',
        title: 'Failed share of turns',
        metric: METRIC_NAME.turns,
        aggregation: 'ratio',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.providerName),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.turnOutcome)]: 'failed' },
      },
    ],
  },
  {
    id: 'model-regression',
    title: 'Model regression',
    panels: [
      {
        id: 'ttft-p95-by-release',
        title: 'Time to first token p95 by release and model',
        metric: METRIC_NAME.turnTimeToFirstToken,
        aggregation: 'p95',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
      },
      {
        id: 'turn-cost-p50-by-release',
        title: 'Cost per turn p50 by release and model',
        metric: METRIC_NAME.turnCost,
        aggregation: 'p50',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
      },
      // False success is the quality proxy that needs no rater: the product
      // said Done over a call that did not produce what it owed.
      {
        id: 'false-success-by-release',
        title: 'Completions reported as success that were not, by release',
        metric: METRIC_NAME.falseSuccess,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.completionKind),
        ],
      },
      {
        id: 'turn-failure-ratio-by-release',
        title: 'Failed share of turns by release',
        metric: METRIC_NAME.turns,
        aggregation: 'ratio',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.serviceVersion),
          attributeKey(OBSERVABILITY_ATTRIBUTE.requestModel),
        ],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.turnOutcome)]: 'failed' },
      },
    ],
  },
  {
    id: 'database-health',
    title: 'Database health',
    panels: [
      {
        id: 'database-operation-rate',
        title: 'Queries by operation',
        metric: METRIC_NAME.databaseOperations,
        aggregation: 'rate',
        groupBy: [attributeKey(LOCAL_METRIC_LABEL.databaseOperation)],
      },
      {
        id: 'database-error-ratio',
        title: 'Failed share of queries',
        metric: METRIC_NAME.databaseOperations,
        aggregation: 'ratio',
        groupBy: [attributeKey(LOCAL_METRIC_LABEL.databaseOperation)],
        match: { [attributeKey(LOCAL_METRIC_LABEL.databaseOutcome)]: 'error' },
      },
      // A saturated pool shows as latency long before it shows as an error, so
      // the tail is the reading that moves first.
      {
        id: 'database-latency-p95',
        title: 'Query latency p95',
        metric: METRIC_NAME.databaseDuration,
        aggregation: 'p95',
        groupBy: [attributeKey(LOCAL_METRIC_LABEL.databaseOperation)],
      },
      {
        id: 'database-latency-p99',
        title: 'Query latency p99',
        metric: METRIC_NAME.databaseDuration,
        aggregation: 'p99',
        groupBy: [attributeKey(LOCAL_METRIC_LABEL.databaseOperation)],
      },
    ],
  },
  {
    id: 'model-routing',
    title: 'Model routing',
    panels: [
      {
        id: 'routing-decision-rate',
        title: 'Routing decisions by route',
        metric: METRIC_NAME.routingDecisions,
        aggregation: 'rate',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.routeId),
          attributeKey(OBSERVABILITY_ATTRIBUTE.routingCohort),
        ],
      },
      {
        id: 'routing-unavailable-ratio',
        title: 'Share of turns with no route',
        metric: METRIC_NAME.routingDecisions,
        aggregation: 'ratio',
        groupBy: [
          attributeKey(OBSERVABILITY_ATTRIBUTE.trustMode),
          attributeKey(OBSERVABILITY_ATTRIBUTE.dataRegion),
        ],
        match: { [attributeKey(OBSERVABILITY_ATTRIBUTE.routingStatus)]: 'unavailable' },
      },
    ],
  },
] as const;

export function attributeKey(attribute: string): string {
  return attribute.replace(/[.-]/gu, '_');
}

function seriesName(metric: DashboardMetric, suffix: string): string {
  return `${attributeKey(metric)}${suffix}`;
}

function selector(match: Readonly<Record<string, string>> | undefined): string {
  const entries = Object.entries(match ?? {});
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}=~"${value}"`).join(',')}}`;
}

function counterRate(panel: DashboardPanel, match: Readonly<Record<string, string>> | undefined) {
  return `sum by (${panel.groupBy.join(',')}) (rate(${seriesName(panel.metric, '_total')}${selector(match)}[${RATE_WINDOW}]))`;
}

export function panelQuery(panel: DashboardPanel): string {
  if (panel.aggregation === 'rate') return counterRate(panel, panel.match);
  if (panel.aggregation === 'ratio') {
    return `${counterRate(panel, panel.match)} / ${counterRate(panel, panel.of)}`;
  }
  // A gauge has no _total and no _bucket: it is read at its last value.
  if (panel.aggregation === 'max') {
    return `max by (${panel.groupBy.join(',')}) (${seriesName(panel.metric, '')}${selector(panel.match)})`;
  }
  const quantile = HISTOGRAM_QUANTILE[panel.aggregation];
  return `histogram_quantile(${quantile}, sum by (le,${panel.groupBy.join(',')}) (rate(${seriesName(panel.metric, '_bucket')}${selector(panel.match)}[${RATE_WINDOW}])))`;
}

export function dashboardPanels(): readonly DashboardPanel[] {
  return SERVICE_DASHBOARDS.flatMap((dashboard) => dashboard.panels);
}

export interface ServiceDashboardPanelView {
  readonly id: string;
  readonly title: string;
  readonly metric: DashboardMetric;
  readonly aggregation: PanelAggregation;
  readonly query: string;
}

export interface ServiceDashboardView {
  readonly id: string;
  readonly title: string;
  readonly panels: readonly ServiceDashboardPanelView[];
}

export interface ServiceDashboardsReport {
  readonly metricsBackendConfigured: boolean;
  readonly serviceName: string | null;
  readonly dashboards: readonly ServiceDashboardView[];
}

export function serviceDashboardViews(): readonly ServiceDashboardView[] {
  return SERVICE_DASHBOARDS.map((dashboard) => ({
    id: dashboard.id,
    title: dashboard.title,
    panels: dashboard.panels.map((panel) => ({
      id: panel.id,
      title: panel.title,
      metric: panel.metric,
      aggregation: panel.aggregation,
      query: panelQuery(panel),
    })),
  }));
}
