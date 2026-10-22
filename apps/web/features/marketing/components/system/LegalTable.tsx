import { Children, Fragment, isValidElement, type ReactNode } from 'react';

import type { LedgerRow } from './Ledger';

function splitLines(value: ReactNode): ReactNode[][] {
  const children =
    isValidElement<{ children?: ReactNode }>(value) && value.type === Fragment
      ? value.props.children
      : value;
  const lines: ReactNode[][] = [[]];
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === 'br') {
      lines.push([]);
    } else {
      lines[lines.length - 1]?.push(child);
    }
  }
  return lines;
}

function Lines({ lines }: { lines: ReactNode[][] }) {
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

export function LegalTable({ rows, caption }: { rows: readonly LedgerRow[]; caption: string }) {
  return (
    <div className="agi-ds-legal-table">
      <table>
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map((row, index) => {
            const lines = splitLines(row.value);
            return (
              <tr key={index}>
                <th scope="row">{row.label}</th>
                <td>
                  <Lines lines={lines.slice(0, -1)} />
                </td>
                <td>
                  <Lines lines={lines.slice(-1)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
