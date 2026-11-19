import {
  resolveAnswerUiNumber,
  type AnswerUiChartBlock,
  type AnswerUiControlBlock,
  type AnswerUiValues,
  type ChartRenderSpec,
  type ChartRow,
} from '@agiworkforce/types';

export const ANSWER_UI_CHART_DATA_LABEL = 'Data table';
export const ANSWER_UI_MAP_NOTE = 'Pins are placed from the answer and can be approximate.';

const LABEL_KEY = 'label';

function seriesKey(index: number): string {
  return `series_${index}`;
}

export function answerUiChartSpec(
  block: AnswerUiChartBlock,
  controls: ReadonlyMap<string, AnswerUiControlBlock>,
  values: AnswerUiValues,
): ChartRenderSpec {
  const rows: ChartRow[] = [];
  const rowFor = new Map<string, ChartRow>();
  block.series.forEach((series, index) => {
    for (const point of series.points) {
      const y = resolveAnswerUiNumber(point.y, controls, values);
      const key = block.chart === 'scatter' ? `${index}:${rows.length}` : String(point.x);
      let row = rowFor.get(key);
      if (!row) {
        row = { [LABEL_KEY]: point.x };
        rowFor.set(key, row);
        rows.push(row);
      }
      if (y !== null) row[seriesKey(index)] = y;
    }
  });
  return {
    kind: block.chart,
    rows,
    xKey: LABEL_KEY,
    series: block.series.map((series, index) => ({ dataKey: seriesKey(index), name: series.name })),
    showLegend: block.series.length > 1 || block.chart === 'pie',
    totalRows: rows.length,
    title: block.title,
    ...(block.xLabel ? { xLabel: block.xLabel } : {}),
    ...(block.yLabel ? { yLabel: block.yLabel } : {}),
  };
}
