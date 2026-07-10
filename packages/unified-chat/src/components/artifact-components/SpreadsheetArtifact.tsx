/**
 * SpreadsheetArtifact — read-only tabular renderer for spreadsheet/table/csv
 * artifacts (claude.ai CSV-preview parity).
 *
 * Surface-agnostic: no Tauri imports, no desktop-specific deps.
 * Content is parsed by `lib/tabular` (CSV/TSV with quoted fields, embedded
 * delimiters/newlines, BOM, ragged rows — plus the legacy JSON
 * array-of-objects shape). Features:
 *  - sticky header row with click-to-sort (asc → desc → original), numeric-aware
 *  - numeric columns right-aligned with tabular numerals
 *  - row cap with an honest "Showing first N of M rows" note (no virtual jank)
 *  - cell selection + Ctrl/Cmd-C copy (Escape clears)
 *  - honest raw-content fallback when the content is not tabular
 *
 * Downloads/exports stay in the host artifact chrome (ArtifactRenderer's
 * export menu / web ArtifactPreview download menu) — no duplicate buttons here.
 */

import { ArrowDown, ArrowUp, FileSpreadsheet } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { numericValue, parseTabular } from '../../lib/tabular';
import type { Artifact } from '../../lib/types';

export interface SpreadsheetArtifactProps {
  artifact: Artifact;
  className?: string;
  /** @deprecated The renderer is always read-only; kept for API compatibility. */
  readOnly?: boolean;
}

/** Rows rendered before capping. Keeps the DOM honest and responsive. */
export const SPREADSHEET_ROW_CAP = 500;

type SortState = { column: number; direction: 'asc' | 'desc' } | null;

export function SpreadsheetArtifact({ artifact, className }: SpreadsheetArtifactProps) {
  const data = useMemo(() => parseTabular(artifact.content), [artifact.content]);

  const [sort, setSort] = useState<SortState>(null);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [copiedCell, setCopiedCell] = useState(false);

  const sortedRows = useMemo(() => {
    if (!data) return [];
    if (!sort) return data.rows;
    const { column, direction } = sort;
    const numeric = data.numericColumns[column] ?? false;
    const sign = direction === 'asc' ? 1 : -1;
    // Stable sort; empty cells always sink to the bottom.
    return [...data.rows].sort((a, b) => {
      const av = (a[column] ?? '').trim();
      const bv = (b[column] ?? '').trim();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      if (numeric) {
        const an = numericValue(av);
        const bn = numericValue(bv);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return sign * (an - bn);
      }
      return sign * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data, sort]);

  const visibleRows = sortedRows.slice(0, SPREADSHEET_ROW_CAP);
  const truncated = sortedRows.length > SPREADSHEET_ROW_CAP;

  const cycleSort = useCallback((column: number) => {
    setSelected(null);
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: 'asc' };
      if (prev.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }, []);

  const copySelected = useCallback(async () => {
    if (!selected) return;
    const value = visibleRows[selected.r]?.[selected.c] ?? '';
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCell(true);
      setTimeout(() => setCopiedCell(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [selected, visibleRows]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && selected) {
        e.preventDefault();
        void copySelected();
      }
    },
    [selected, copySelected],
  );

  if (!data) {
    // Honest fallback: name the problem and show the raw content instead of a
    // dead-end "invalid data" card.
    return (
      <div
        className={cn('flex flex-col bg-background border rounded-lg overflow-hidden', className)}
        data-testid="spreadsheet-artifact-fallback"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 text-muted-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-xs">
            This content couldn&apos;t be parsed as a table — showing it as text.
          </span>
        </div>
        <pre className="p-3 text-xs text-foreground whitespace-pre-wrap break-words overflow-auto max-h-[400px]">
          {artifact.content}
        </pre>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background border rounded-lg overflow-hidden',
        className,
      )}
      data-testid="spreadsheet-artifact"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sheet</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {data.rows.length} {data.rows.length === 1 ? 'row' : 'rows'} · {data.columns.length}{' '}
            {data.columns.length === 1 ? 'column' : 'columns'}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground pr-1" aria-live="polite">
          {copiedCell ? 'Cell copied' : selected ? 'Ctrl/⌘+C to copy cell' : ''}
        </span>
      </div>

      {/* Table */}
      <div
        className="flex-1 overflow-auto relative bg-background outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="group"
        aria-label={artifact.title || 'Spreadsheet'}
      >
        <table className="w-full border-collapse text-sm" data-testid="spreadsheet-table">
          <thead className="sticky top-0 z-10 shadow-sm ring-1 ring-border">
            <tr>
              <th className="w-10 border-r border-b border-border bg-muted p-1 text-center text-[10px] text-muted-foreground font-medium select-none">
                #
              </th>
              {data.columns.map((col, colIdx) => {
                const isSorted = sort?.column === colIdx;
                const numeric = data.numericColumns[colIdx];
                return (
                  <th
                    key={`${col}-${colIdx}`}
                    aria-sort={
                      isSorted ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                    className={cn(
                      'min-w-[120px] border-r border-b border-border bg-muted/80 p-0 font-semibold text-xs text-foreground select-none whitespace-nowrap',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => cycleSort(colIdx)}
                      className={cn(
                        'flex w-full items-center gap-1 px-2 py-2 hover:bg-accent/60 transition-colors',
                        numeric ? 'justify-end text-right' : 'justify-start text-left',
                      )}
                      title={`Sort by ${col}`}
                    >
                      <span className="truncate">{col}</span>
                      {isSorted &&
                        (sort!.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={data.columns.length + 1}
                  className="p-6 text-center text-xs text-muted-foreground"
                >
                  No rows
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="group">
                  <td className="border-r border-b border-border bg-muted/30 p-1 text-center text-[10px] text-muted-foreground font-mono select-none group-hover:bg-accent/50 transition-colors">
                    {rowIndex + 1}
                  </td>
                  {row.map((value, colIdx) => {
                    const isSelected = selected?.r === rowIndex && selected?.c === colIdx;
                    const numeric = data.numericColumns[colIdx];
                    return (
                      <td
                        key={colIdx}
                        onClick={() => setSelected(isSelected ? null : { r: rowIndex, c: colIdx })}
                        aria-selected={isSelected || undefined}
                        className={cn(
                          'border-r border-b border-border p-0 min-w-[120px] cursor-default transition-colors',
                          'hover:bg-accent/40',
                          isSelected &&
                            'ring-2 ring-inset ring-primary bg-primary/10 dark:bg-primary/20',
                        )}
                      >
                        <div
                          className={cn(
                            'px-2 py-1.5 text-foreground text-xs whitespace-pre-wrap break-words',
                            numeric && 'text-right tabular-nums',
                          )}
                        >
                          {value}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer — honest truncation note */}
      {truncated && (
        <div
          className="border-t bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground"
          data-testid="spreadsheet-truncation-note"
        >
          Showing first {SPREADSHEET_ROW_CAP} of {sortedRows.length} rows. Download the CSV for the
          full data.
        </div>
      )}
    </div>
  );
}
