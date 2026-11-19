'use client';

import { useId, useMemo } from 'react';
import { ChartSpecView, summarizeChart } from '@agiworkforce/unified-chat';
import {
  formatAnswerUiNumber,
  resolveAnswerUiNumber,
  type AnswerUiChartBlock,
  type AnswerUiControlBlock,
  type AnswerUiValues,
  type ChartRenderSpec,
  type ChartRow,
} from '@agiworkforce/types';

export const ANSWER_UI_CHART_HEIGHT_PX = 240;
export const ANSWER_UI_CHART_DATA_LABEL = 'Data table';
const CHART_LOADING_LABEL = 'Drawing chart';
const CHART_FAILED_LABEL = 'This chart could not be drawn. The data table below has its values.';
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

function cellValue(value: ChartRow[string] | undefined): string {
  if (typeof value === 'number') return formatAnswerUiNumber(value);
  return value ?? '';
}

export function AnswerUiChart({
  block,
  controls,
  values,
}: {
  block: AnswerUiChartBlock;
  controls: ReadonlyMap<string, AnswerUiControlBlock>;
  values: AnswerUiValues;
}) {
  const titleId = useId();
  const summaryId = useId();
  const spec = useMemo(() => answerUiChartSpec(block, controls, values), [block, controls, values]);
  const resetKey = useMemo(() => JSON.stringify(spec.rows), [spec.rows]);

  return (
    <figure
      data-testid="answer-ui-chart"
      data-chart-kind={block.chart}
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      className="min-w-0 rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] p-3"
    >
      <figcaption
        id={titleId}
        className="px-1 pb-2 text-sm font-semibold text-[color:var(--chat-text-primary)]"
      >
        {block.title}
      </figcaption>
      <p id={summaryId} className="sr-only">
        {summarizeChart(spec)}
      </p>
      <ChartSpecView
        spec={spec}
        height={ANSWER_UI_CHART_HEIGHT_PX}
        resetKey={resetKey}
        loadingLabel={CHART_LOADING_LABEL}
        fallback={
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-[color:var(--chat-text-secondary)]">
            {CHART_FAILED_LABEL}
          </p>
        }
      />
      <details className="group mt-2 rounded-xl border border-[var(--chat-border)]">
        <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-xl px-3 text-sm font-medium text-[color:var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          {ANSWER_UI_CHART_DATA_LABEL}
        </summary>
        <div className="overflow-x-auto border-t border-[var(--chat-border-subtle)]">
          <table data-testid="answer-ui-chart-table" className="w-full text-start text-sm">
            <caption className="sr-only">{block.title}</caption>
            <thead>
              <tr className="border-b border-[var(--chat-border-subtle)]">
                <th
                  scope="col"
                  className="px-3 py-2 text-start font-medium text-[color:var(--chat-text-secondary)]"
                >
                  {block.xLabel ?? (block.chart === 'scatter' ? 'x' : 'Label')}
                </th>
                {spec.series.map((series) => (
                  <th
                    key={series.dataKey}
                    scope="col"
                    className="px-3 py-2 text-end font-medium text-[color:var(--chat-text-secondary)]"
                  >
                    {series.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.rows.map((row, index) => (
                <tr
                  key={`${index}:${String(row[LABEL_KEY])}`}
                  className="border-b border-[var(--chat-border-subtle)] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-3 py-2 text-start font-normal text-[color:var(--chat-text-primary)]"
                  >
                    {cellValue(row[LABEL_KEY])}
                  </th>
                  {spec.series.map((series) => (
                    <td
                      key={series.dataKey}
                      className="px-3 py-2 text-end tabular-nums text-[color:var(--chat-text-primary)]"
                    >
                      {cellValue(row[series.dataKey])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
