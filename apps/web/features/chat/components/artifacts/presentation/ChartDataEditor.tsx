'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CHART_KINDS } from '@agiworkforce/types';
import { isChartKind, type EditableChart } from './chart-block';

const KIND_LABELS: Record<string, string> = { bar: 'Bar', line: 'Line', pie: 'Pie' };

export function ChartDataEditor({
  initial,
  onApply,
  onRemove,
  onCancel,
}: {
  initial: EditableChart;
  onApply: (chart: EditableChart) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [chart, setChart] = useState<EditableChart>(initial);
  const columns = [chart.xKey, ...chart.seriesKeys];

  const setCell = (rowIndex: number, key: string, value: string) =>
    setChart((current) => ({
      ...current,
      rows: current.rows.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)),
    }));

  return (
    <section
      className="rounded-xl border border-[var(--chat-border-strong)] bg-card p-3"
      aria-label="Chart data"
      data-testid="chart-data-editor"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Chart type
          <select
            value={chart.kind}
            onChange={(event) => {
              const kind = event.target.value;
              if (isChartKind(kind)) setChart((current) => ({ ...current, kind }));
            }}
            className="h-11 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground sm:h-8"
          >
            {CHART_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind] ?? kind}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          Title
          <input
            value={chart.title}
            onChange={(event) => setChart((current) => ({ ...current, title: event.target.value }))}
            className="h-11 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground sm:h-8"
          />
        </label>
      </div>
      <div className="max-h-56 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((key) => (
                <th
                  key={key}
                  className="px-1 pb-1 text-start text-xs font-medium text-muted-foreground"
                >
                  {key}
                </th>
              ))}
              <th className="w-10" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((key) => (
                  <td key={key} className="px-1 py-0.5">
                    <input
                      value={row[key] ?? ''}
                      onChange={(event) => setCell(rowIndex, key, event.target.value)}
                      aria-label={`${key}, row ${rowIndex + 1}`}
                      className="h-11 w-full min-w-16 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground sm:h-8"
                    />
                  </td>
                ))}
                <td className="px-1">
                  <button
                    type="button"
                    onClick={() =>
                      setChart((current) => ({
                        ...current,
                        rows: current.rows.filter((_, index) => index !== rowIndex),
                      }))
                    }
                    aria-label={`Remove row ${rowIndex + 1}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:h-8 sm:w-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setChart((current) => ({
              ...current,
              rows: [...current.rows, Object.fromEntries(columns.map((key) => [key, '']))],
            }))
          }
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-8"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add row
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          className="min-h-11 rounded-md px-3 text-sm text-danger-text hover:bg-[var(--chat-surface-hover)] sm:min-h-8"
        >
          Remove chart
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md px-3 text-sm text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-8"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(chart)}
          className="min-h-11 rounded-md bg-primary px-3 text-sm text-primary-foreground sm:min-h-8"
          data-testid="chart-data-apply"
        >
          Apply
        </button>
      </div>
    </section>
  );
}
