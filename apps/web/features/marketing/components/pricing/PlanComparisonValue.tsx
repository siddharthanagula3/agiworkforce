'use client';

import { useTranslation } from 'react-i18next';

export type PlanComparisonCell =
  { kind: 'included' } | { kind: 'excluded' } | { kind: 'text'; lines: readonly string[] };

export interface PlanComparisonPlan {
  planId: string;
  label: string;
  price: string;
  billing?: string;
}

export interface PlanComparisonRow {
  id: string;
  label: string;
  note?: string;
  cells: Readonly<Record<string, PlanComparisonCell>>;
}

export interface PlanComparisonGroup {
  id: string;
  label: string;
  rows: ReadonlyArray<PlanComparisonRow>;
}

export const INCLUDED_CELL: PlanComparisonCell = { kind: 'included' };
export const EXCLUDED_CELL: PlanComparisonCell = { kind: 'excluded' };

export function textCell(...lines: string[]): PlanComparisonCell {
  return { kind: 'text', lines };
}

export function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="agi-tier-check-icon"
    >
      <path
        d="M2 7L5.5 10.5L12 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlanComparisonValue({ cell = EXCLUDED_CELL }: { cell?: PlanComparisonCell }) {
  const { t } = useTranslation('pricing');
  if (cell.kind === 'included') {
    return (
      <span className="agi-compare-value agi-compare-value--included">
        <CheckIcon />
        <span className="sr-only">{t('included')}</span>
      </span>
    );
  }
  if (cell.kind === 'excluded') {
    return (
      <span className="agi-compare-value agi-compare-value--excluded">
        <span aria-hidden="true">–</span>
        <span className="sr-only">{t('notIncluded')}</span>
      </span>
    );
  }
  return (
    <span className="agi-compare-value agi-compare-value--text">
      {cell.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}
