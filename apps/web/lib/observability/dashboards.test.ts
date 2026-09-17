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

  it('groups the browser panels by a surface attribute the spans also carry', () => {
    const browser = dashboardPanels().filter((panel) => panel.id.startsWith('browser-task'));
    expect(browser).toHaveLength(2);
    for (const panel of browser) {
      expect(panel.groupBy).toEqual([OBSERVABILITY_ATTRIBUTE.surface.replaceAll('.', '_')]);
    }
  });
});
