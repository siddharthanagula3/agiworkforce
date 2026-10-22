import { describe, expect, it } from 'vitest';
import { parseChartArtifact } from '../chart-spec';

const SEGMENTS = [
  { product: 'Core', revenue: 13.2 },
  { product: 'Analytics', revenue: 7.1 },
  { product: 'Copilot', revenue: 3.5 },
  { product: 'Support', revenue: 2.2 },
  { product: 'Legacy', revenue: 0.3 },
];

describe('donut chart parsing', () => {
  it.each(['donut', 'Doughnut'])('reads type %s as a pie with a hole, legend on', (type) => {
    const parsed = parseChartArtifact(JSON.stringify({ type, data: SEGMENTS }));
    expect(parsed).toMatchObject({
      ok: true,
      spec: { kind: 'pie', donut: true, xKey: 'product', showLegend: true },
    });
    if (parsed.ok) {
      expect(parsed.spec.rows.map((row) => row['product'])).toEqual(
        SEGMENTS.map((row) => row.product),
      );
    }
  });

  it('leaves a plain pie without a hole', () => {
    const parsed = parseChartArtifact(JSON.stringify({ type: 'pie', data: SEGMENTS }));
    expect(parsed.ok && parsed.spec.donut).toBeFalsy();
  });

  it('names donut among the supported types when a type is refused', () => {
    const parsed = parseChartArtifact(JSON.stringify({ type: 'radar', data: SEGMENTS }));
    expect(parsed).toEqual({
      ok: false,
      reason: 'Unsupported chart type "radar". Supported types: bar, line, pie, donut.',
    });
  });
});
