import type { ReactNode } from 'react';

export interface LedgerRow {
  label: ReactNode;
  value: ReactNode;
  quiet?: boolean;
}

export function Ledger({ rows, caption }: { rows: readonly LedgerRow[]; caption?: string }) {
  return (
    <ul className="agi-ds-ledger" aria-label={caption}>
      {rows.map((row, index) => (
        <li className="agi-ds-ledger-row" key={index}>
          <span className="agi-ds-ledger-label">{row.label}</span>
          <span className="agi-ds-ledger-value" data-tone={row.quiet ? 'quiet' : undefined}>
            {row.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
