import type { ReactNode } from 'react';

export interface LedgerRow {
  label: string;
  value: ReactNode;
  quiet?: boolean;
}

export function Ledger({ rows, caption }: { rows: readonly LedgerRow[]; caption?: string }) {
  return (
    <ul className="agi-ds-ledger" aria-label={caption}>
      {rows.map((row) => (
        <li className="agi-ds-ledger-row" key={row.label}>
          <span className="agi-ds-ledger-label">{row.label}</span>
          <span className="agi-ds-ledger-value" data-tone={row.quiet ? 'quiet' : undefined}>
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
