import type { AnswerUiChartBlock, AnswerUiControlBlock } from '@agiworkforce/types';
import { answerUiChartSpec } from '@agiworkforce/unified-chat/answer-ui';
import { answerUiScatterAxis, answerUiScatterSeries, describeAnswerUiScatter } from '../answer-ui';

const SLIDER: AnswerUiControlBlock = {
  type: 'slider',
  id: 'k',
  label: 'K',
  min: 0,
  max: 10,
  step: 1,
  value: 2,
};

const BLOCK: AnswerUiChartBlock = {
  type: 'chart',
  id: 's',
  title: 'Spread',
  chart: 'scatter',
  series: [
    {
      name: 'A',
      points: [
        { x: 1, y: '=k * 3' },
        { x: 'label', y: 4 },
        { x: 2, y: '=missing' },
      ],
    },
  ],
};

describe('answer-ui scatter helpers', () => {
  it('keeps numeric x points and resolves y against the controls', () => {
    const controls = new Map([[SLIDER.id, SLIDER]]);
    expect(answerUiScatterSeries(answerUiChartSpec(BLOCK, controls, { k: 5 }))).toEqual([
      { name: 'A', points: [{ x: 1, y: 15 }] },
    ]);
  });

  it('builds an axis that includes zero and ends on round ticks', () => {
    expect(answerUiScatterAxis([12, 87], 4)).toEqual({
      low: 0,
      high: 100,
      ticks: [0, 20, 40, 60, 80, 100],
    });
    expect(answerUiScatterAxis([-3, 7], 4)).toEqual({
      low: -4,
      high: 8,
      ticks: [-4, -2, 0, 2, 4, 6, 8],
    });
    expect(answerUiScatterAxis([0.1, 0.35], 4).ticks).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
    expect(answerUiScatterAxis([], 4)).toEqual({ low: 0, high: 0.2, ticks: [0, 0.2] });
  });

  it('describes every point for screen readers', () => {
    expect(
      describeAnswerUiScatter('Spread', [
        { name: 'A', points: [{ x: 1, y: 2.5 }] },
        { name: 'B', points: [] },
      ]),
    ).toBe('Scatter chart, Spread. A: 1, 2.5');
    expect(describeAnswerUiScatter('Spread', [{ name: 'A', points: [] }])).toBe(
      'Scatter chart, Spread: nothing to plot',
    );
  });
});
