import type { CSSProperties } from 'react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { RECEIPT } from './content';

const HEAD_ROW = 1;
const RECEIPT_MARK_SIZE = 22;

function gridRow(row: number): CSSProperties {
  return { '--f3-row': row } as CSSProperties;
}

function rowAt(index: number): CSSProperties {
  return gridRow(index + HEAD_ROW + 1);
}

export function ReceiptDiagram() {
  const footRow = RECEIPT.rows.length + HEAD_ROW + 1;
  return (
    <figure className="f3-diagram" data-illustration aria-label="A route receipt, annotated">
      <div className="f3-receipt-plate" aria-hidden="true" />
      <div className="f3-receipt-head" style={gridRow(HEAD_ROW)}>
        <span className="f3-receipt-brand">
          <AgiMark size={RECEIPT_MARK_SIZE} />
          Route receipt
        </span>
        <span className="f3-label">Illustration</span>
      </div>
      {RECEIPT.rows.map((row, index) => (
        <div
          className="f3-receipt-row"
          data-key={row.key}
          data-lane={row.key === 'route' ? RECEIPT.route : undefined}
          style={rowAt(index)}
          key={row.key}
        >
          <span className="f3-label">{row.label}</span>
          <span className="f3-receipt-value">{row.value}</span>
        </div>
      ))}
      {RECEIPT.rows.map((row, index) => (
        <p className="f3-note" data-side={row.side} style={rowAt(index)} key={`note-${row.key}`}>
          {row.note}
        </p>
      ))}
      {RECEIPT.rows.map((row, index) => (
        <span
          className="f3-leader"
          data-side={row.side}
          style={rowAt(index)}
          aria-hidden="true"
          key={`leader-${row.key}`}
        />
      ))}
      <figcaption className="f3-receipt-foot" style={gridRow(footRow)}>
        {RECEIPT.caption}
      </figcaption>
    </figure>
  );
}
