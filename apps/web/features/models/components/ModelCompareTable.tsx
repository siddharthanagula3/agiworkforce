'use client';

import { MODEL_CAPABILITY_FILTERS, hasCapability } from '../lib/model-filters';
import {
  accessLabel,
  creditsPerMillionLabel,
  statusLabel,
  tokenCeilingLabel,
} from '../lib/model-presentation';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';

const HEAD_CLASS =
  'whitespace-nowrap px-3 py-2 text-left text-xs font-normal text-muted-foreground';
const CELL_CLASS = 'whitespace-nowrap px-3 py-2 text-left text-sm text-foreground';
const PRESENT_LABEL = 'Yes';
const ABSENT_LABEL = 'No';
const AVAILABLE_LABEL = 'Available';

export interface ModelCompareTableProps {
  entries: readonly ModelCatalogueEntry[];
  planLabel: string;
}

export function ModelCompareTable({ entries, planLabel }: ModelCompareTableProps) {
  const rows: { label: string; value: (entry: ModelCatalogueEntry) => string }[] = [
    { label: 'Developer', value: (entry) => entry.developerLabel },
    { label: 'Model id', value: (entry) => entry.id },
    { label: 'Context', value: (entry) => tokenCeilingLabel(entry.contextTokens) },
    { label: 'Max output', value: (entry) => tokenCeilingLabel(entry.maxOutputTokens) },
    {
      label: 'Input per million',
      value: (entry) => creditsPerMillionLabel(entry.inputPerMillion),
    },
    {
      label: 'Output per million',
      value: (entry) => creditsPerMillionLabel(entry.outputPerMillion),
    },
    { label: 'Access', value: (entry) => accessLabel(entry, planLabel) },
    { label: 'Status', value: (entry) => statusLabel(entry) ?? AVAILABLE_LABEL },
    ...MODEL_CAPABILITY_FILTERS.map((filter) => ({
      label: filter.label,
      value: (entry: ModelCatalogueEntry) =>
        hasCapability(entry, filter.capability) ? PRESENT_LABEL : ABSENT_LABEL,
    })),
  ];

  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table className="w-full border-collapse" data-testid="model-compare-table">
        <caption className="sr-only">Model comparison</caption>
        <thead>
          <tr className="border-b border-[var(--chat-border)]">
            <th scope="col" className={HEAD_CLASS}>
              Attribute
            </th>
            {entries.map((entry) => (
              <th
                key={entry.id}
                scope="col"
                className="px-3 py-2 text-left text-sm text-foreground"
              >
                {entry.displayName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[var(--chat-border)]">
              <th scope="row" className={HEAD_CLASS}>
                {row.label}
              </th>
              {entries.map((entry) => (
                <td key={entry.id} className={CELL_CLASS}>
                  {row.value(entry)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
