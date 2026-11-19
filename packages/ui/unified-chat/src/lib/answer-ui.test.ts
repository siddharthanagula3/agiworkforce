import { describe, expect, it } from 'vitest';
import type { AnswerUiChartBlock } from '@agiworkforce/types';
import { answerUiChartSpec } from './answer-ui';
import { mcpAppPlainResultText } from './mcp-app';

describe('answer-ui chart spec', () => {
  it('merges points that share an x value into one row per label', () => {
    const block: AnswerUiChartBlock = {
      type: 'chart',
      id: 'sales',
      chart: 'bar',
      title: 'Sales',
      xLabel: 'Quarter',
      series: [
        {
          name: 'North',
          points: [
            { x: 'Q1', y: 3 },
            { x: 'Q2', y: 4 },
          ],
        },
        { name: 'South', points: [{ x: 'Q1', y: 5 }] },
      ],
    };
    const spec = answerUiChartSpec(block, new Map(), {});
    expect(spec.rows).toEqual([
      { label: 'Q1', series_0: 3, series_1: 5 },
      { label: 'Q2', series_0: 4 },
    ]);
    expect(spec.series).toEqual([
      { dataKey: 'series_0', name: 'North' },
      { dataKey: 'series_1', name: 'South' },
    ]);
    expect(spec).toMatchObject({ kind: 'bar', xKey: 'label', showLegend: true, xLabel: 'Quarter' });
  });
});

describe('mcp app plain result', () => {
  it('joins the text blocks, else shows the structured content', () => {
    expect(
      mcpAppPlainResultText({
        content: [{ type: 'text', text: 'One' }, { type: 'image' }, { type: 'text', text: 'Two' }],
      }),
    ).toBe('One\n\nTwo');
    expect(mcpAppPlainResultText({ content: [], structuredContent: { a: 1 } })).toBe(
      '{\n  "a": 1\n}',
    );
    expect(mcpAppPlainResultText({ content: [] })).toBe('');
  });
});
