'use client';

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface PlanComparisonStackRow {
  planId: string;
  label: string;
}

export interface PlanComparisonStackProps<Row extends PlanComparisonStackRow> {
  rows: ReadonlyArray<Row>;
  columns: ReadonlyArray<readonly [string, string]>;
  cellValue: (column: string, row: Row) => string;
}

export function PlanComparisonStack<Row extends PlanComparisonStackRow>({
  rows,
  columns,
  cellValue,
}: PlanComparisonStackProps<Row>) {
  const { t } = useTranslation('pricing');
  const selectId = useId();
  const [planId, setPlanId] = useState(rows[0]?.planId ?? '');
  const selected = rows.find((row) => row.planId === planId) ?? rows[0];
  if (!selected) return null;

  return (
    <div className="agi-compare-stack">
      <label className="agi-compare-stack-label" htmlFor={selectId}>
        {t('compareStackPlanLabel')}
      </label>
      <select
        id={selectId}
        className="agi-compare-stack-select"
        value={selected.planId}
        onChange={(event) => setPlanId(event.target.value)}
      >
        {rows.map((row) => (
          <option key={row.planId} value={row.planId}>
            {row.label}
          </option>
        ))}
      </select>
      <dl className="agi-compare-stack-list" aria-label={selected.label}>
        {columns.map(([column, label]) => (
          <div key={column} className="agi-compare-stack-item">
            <dt>{label}</dt>
            <dd>{cellValue(column, selected)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
