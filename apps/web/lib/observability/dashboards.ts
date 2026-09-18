import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { METRIC_NAME } from './metrics';

export type DashboardMetric = (typeof METRIC_NAME)[keyof typeof METRIC_NAME];

export type PanelAggregation = 'rate' | 'ratio' | 'p50' | 'p95' | 'max';

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
const HISTOGRAM_QUANTILE: Readonly<Record<'p50' | 'p95', string>> = { p50: '0.5', p95: '0.95' };

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
