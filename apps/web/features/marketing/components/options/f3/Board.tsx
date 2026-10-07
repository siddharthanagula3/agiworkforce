'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Paperclip, RotateCcw } from 'lucide-react';
import { hasProviderMark, ProviderMark } from '@agiworkforce/ui';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { BOARD, BOARD_KEYS, BOARD_ROWS, type BoardKey, type BoardRow } from './content';
import { scramble } from './scramble';

const RAIL_MARK_SIZE = 32;
const PROVIDER_MARK_SIZE = 20;
const ICON_SIZE = 18;
const SEED_ROW = 7919;
const SEED_COLUMN = 104729;
const SEED_VARIANT = 1301;

function cellOrder(index: number): CSSProperties {
  return { '--i': index } as CSSProperties;
}

function Cell({
  row,
  rowIndex,
  columnKey,
  columnIndex,
}: {
  row: BoardRow;
  rowIndex: number;
  columnKey: BoardKey;
  columnIndex: number;
}) {
  const value = row.cells[columnKey];
  const seed = rowIndex * SEED_ROW + columnIndex * SEED_COLUMN;
  const mark =
    columnKey === 'model' && hasProviderMark(row.providerKey) ? (
      <span className="f3-cell-mark">
        <ProviderMark providerKey={row.providerKey} size={PROVIDER_MARK_SIZE} />
      </span>
    ) : null;
  const order = rowIndex * BOARD_KEYS.length + columnIndex;

  return (
    <div role="cell" className="f3-cell" data-key={columnKey} style={cellOrder(order)}>
      <span className="f3-cell-label">{BOARD.labels[columnKey]}</span>
      <span className="f3-cell-value">
        <span className="f3-cell-final">
          {mark}
          {value}
        </span>
        <span className="f3-flap" aria-hidden="true">
          <span className="f3-face f3-face-a">{scramble(value, seed)}</span>
          <span className="f3-face f3-face-b">{scramble(value, seed + SEED_VARIANT)}</span>
          <span className="f3-face f3-face-c">
            {mark}
            {value}
          </span>
        </span>
      </span>
    </div>
  );
}

export function Board() {
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <figure
      className="f3-board"
      data-illustration
      data-paused={paused ? 'true' : undefined}
      aria-label="The same question answered on three routes, with each route's receipt"
    >
      <div className="f3-rail">
        <span className="f3-rail-mark" key={`mark-${run}`}>
          <AgiMark size={RAIL_MARK_SIZE} />
        </span>
        <p className="f3-rail-title">{BOARD.railTitle}</p>
        <div className="f3-rail-prompt">
          <span className="f3-chip">
            <Paperclip size={ICON_SIZE} aria-hidden="true" />
            {BOARD.file}
          </span>
          <q>{BOARD.prompt}</q>
        </div>
        <button
          type="button"
          className="f3-replay"
          aria-label="Replay the board"
          onClick={() => setRun((count) => count + 1)}
        >
          <RotateCcw size={ICON_SIZE} aria-hidden="true" />
        </button>
      </div>

      <div className="f3-grid" role="table" aria-label="Route receipts" key={`grid-${run}`}>
        <div role="row" className="f3-head">
          <span role="columnheader">{BOARD.labels.route}</span>
          {BOARD_KEYS.map((key) => (
            <span role="columnheader" key={key}>
              {BOARD.labels[key]}
            </span>
          ))}
        </div>
        {BOARD_ROWS.map((row, rowIndex) => (
          <div role="row" className="f3-row" data-lane={row.lane} key={row.lane}>
            <div role="rowheader" className="f3-lane">
              <span className="f3-bar" aria-hidden="true" />
              <span className="f3-lane-name">{row.name}</span>
              <span className="f3-lane-note">
                {row.where}
                <br />
                {row.status}
              </span>
            </div>
            {BOARD_KEYS.map((key, columnIndex) => (
              <Cell
                key={key}
                row={row}
                rowIndex={rowIndex}
                columnKey={key}
                columnIndex={columnIndex}
              />
            ))}
          </div>
        ))}
      </div>

      <figcaption className="f3-foot">
        <span className="f3-foot-note">{BOARD.note}</span>
        <span className="f3-foot-links">
          {BOARD.links.map((link) => (
            <Link href={link.href} className="f3-link" data-lane={link.lane} key={link.lane}>
              {link.label}
            </Link>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}
