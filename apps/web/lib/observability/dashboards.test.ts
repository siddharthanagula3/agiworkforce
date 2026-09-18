import { describe, expect, it } from 'vitest';

import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { SERVICE_DASHBOARDS, dashboardPanels, panelQuery } from './dashboards';
import { METRIC_NAME } from './metrics';

const RECORDED_METRICS: ReadonlySet<string> = new Set(Object.values(METRIC_NAME));

/**
 * §87 asks for a dashboard, not a metric. A definition that names a metric no
 * instrument creates is a dashboard of empty panels, so the only thing worth
 * asserting is that every panel is bound to a metric this process emits and
 * groups by an attribute this process sets.
 */
describe('service dashboards', () => {
  it('binds every panel to a metric the web app records', () => {
    for (const panel of dashboardPanels()) {
      expect(RECORDED_METRICS.has(panel.metric), `${panel.id} names ${panel.metric}`).toBe(true);
    }
  });

  it('gives every panel a unique id', () => {
    const ids = dashboardPanels().map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the request rate and overall HTTP error rate', () => {
    const http = SERVICE_DASHBOARDS.find((dashboard) => dashboard.id === 'http-traffic');
    const byId = new Map(http?.panels.map((panel) => [panel.id, panel]));
    expect(byId.get('request-rate')?.metric).toBe(METRIC_NAME.httpRequests);
    expect(byId.get('error-rate')?.match).toEqual({ error_type: '5xx' });
  });

  it('covers browser health and notification delivery', () => {
    const ids = SERVICE_DASHBOARDS.map((dashboard) => dashboard.id);
    expect(ids).toContain('browser-health');
    expect(ids).toContain('notification-delivery');
  });

  it('renders a ratio panel over the same metric on both sides', () => {
    const delivered = dashboardPanels().find(
      (panel) => panel.id === 'notification-delivered-ratio',
    );
    const query = panelQuery(delivered!);
    const [numerator, denominator] = query.split(' / ');
    expect(numerator).toContain('agi_notification_deliveries_total');
    expect(denominator).toContain('agi_notification_deliveries_total');
    expect(numerator).toContain('agi_notification_outcome=~"delivered"');
    expect(denominator).toContain('agi_notification_outcome=~"delivered|failed"');
  });

  it('renders a histogram panel as a quantile over buckets', () => {
    const latency = dashboardPanels().find((panel) => panel.id === 'request-latency-p95');
    expect(panelQuery(latency!)).toBe(
      'histogram_quantile(0.95, sum by (le,http_request_method) (rate(http_server_request_duration_bucket[5m])))',
    );
  });

  it('correlates a deploy with an error spike by splitting HTTP errors per release', () => {
    const release = SERVICE_DASHBOARDS.find((dashboard) => dashboard.id === 'release-health');
    const byId = new Map(release?.panels.map((panel) => [panel.id, panel]));
    expect(byId.get('error-rate-by-release')?.groupBy).toContain('service_version');
    expect(byId.get('crash-rate-by-release')?.groupBy).toContain('service_version');
    expect(byId.get('traffic-by-client-version')?.groupBy).toContain('agi_client_version');
  });

  it('reads a gauge at its last value rather than as a rate or a histogram', () => {
    const stuck = dashboardPanels().find((panel) => panel.id === 'stuck-jobs');
    expect(panelQuery(stuck!)).toBe('max by (messaging_destination_name) (agi_queue_stuck)');
  });

  it('shows the queue age and the share of turns that found no route', () => {
    const ids = dashboardPanels().map((panel) => panel.id);
    expect(ids).toContain('queue-age');
    const unavailable = dashboardPanels().find((panel) => panel.id === 'routing-unavailable-ratio');
    expect(unavailable?.match).toEqual({ agi_routing_status: 'unavailable' });
  });

  it('reads the tail as well as the median, so p99 is not missing from latency', () => {
    const p99 = dashboardPanels().find((panel) => panel.id === 'request-latency-p99');
    expect(panelQuery(p99!)).toBe(
      'histogram_quantile(0.99, sum by (le,http_request_method) (rate(http_server_request_duration_bucket[5m])))',
    );
    const aggregations = new Set(dashboardPanels().map((panel) => panel.aggregation));
    expect(aggregations.has('p95')).toBe(true);
    expect(aggregations.has('p99')).toBe(true);
  });

  it('gives every latency metric on a dashboard a p99 panel, not only a p95 one', () => {
    const latencyMetrics = new Set(
      dashboardPanels()
        .filter((panel) => panel.aggregation === 'p95')
        .map((panel) => panel.metric),
    );
    const p99Metrics = new Set(
      dashboardPanels()
        .filter((panel) => panel.aggregation === 'p99')
        .map((panel) => panel.metric),
    );
    for (const metric of latencyMetrics) {
      expect(p99Metrics.has(metric), `${metric} has a p95 panel but no p99 panel`).toBe(true);
    }
  });

  it('breaks traffic and failure down by provider and model', () => {
    const board = SERVICE_DASHBOARDS.find((dashboard) => dashboard.id === 'provider-and-model');
    expect(board).toBeDefined();
    const byId = new Map(board?.panels.map((panel) => [panel.id, panel]));
    expect(byId.get('turn-rate-by-provider-model')?.groupBy).toEqual([
      'gen_ai_provider_name',
      'gen_ai_request_model',
    ]);
    expect(byId.get('no-route-ratio-by-provider-model')?.groupBy).toEqual([
      'gen_ai_provider_name',
      'gen_ai_request_model',
    ]);
    expect(byId.get('span-latency-p99-by-provider')?.aggregation).toBe('p99');
  });

  it('shows completions the code called a success that were not one', () => {
    const board = SERVICE_DASHBOARDS.find((dashboard) => dashboard.id === 'completion-truth');
    const byId = new Map(board?.panels.map((panel) => [panel.id, panel]));
    expect(byId.get('false-success-rate')?.metric).toBe(METRIC_NAME.falseSuccess);
    expect(byId.get('completion-status-rate')?.groupBy).toContain('agi_completion_status');
  });

  it('groups the browser panels by a surface attribute the spans also carry', () => {
    const browser = dashboardPanels().filter((panel) => panel.id.startsWith('browser-task'));
    expect(browser).toHaveLength(2);
    for (const panel of browser) {
      expect(panel.groupBy).toEqual([OBSERVABILITY_ATTRIBUTE.surface.replaceAll('.', '_')]);
    }
  });
});
