import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Maximize2, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  useUiTranslation,
} from '@agiworkforce/ui';
import { toCsv, toTsv, type TabularData } from '../../lib/tabular';
import { downloadTextFile } from './downloadTextFile';

type CopyState = 'idle' | 'copied' | 'failed';

const TABLE_CLASS = 'w-full border-collapse text-sm';

const ACTION_BUTTON_CLASS =
  'h-8 w-8 p-0 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

function readTableData(table: HTMLTableElement): TabularData {
  const lines = Array.from(table.rows, (row) =>
    Array.from(row.cells, (cell) => (cell.textContent ?? '').trim()),
  );
  const columns = lines[0] ?? [];
  return {
    columns,
    rows: lines.slice(1),
    numericColumns: columns.map(() => false),
    source: 'delimited',
    delimiter: ',',
  };
}

function TableActions({
  onCopy,
  onDownload,
  copyState,
  children,
}: {
  onCopy: () => void;
  onDownload: () => void;
  copyState: CopyState;
  children?: React.ReactNode;
}) {
  const { t } = useUiTranslation('chat');
  const copyLabel =
    copyState === 'copied'
      ? t('markdownTable.copied', 'Table copied')
      : copyState === 'failed'
        ? t('markdownTable.copyFailed', 'Copy failed, clipboard unavailable')
        : t('markdownTable.copy', 'Copy table');
  return (
    <div className="flex items-center gap-1">
      {copyState === 'failed' && (
        <span role="status" className="px-1 text-xs text-[var(--chat-destructive-text)]">
          {copyLabel}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCopy}
        aria-label={copyLabel}
        title={copyLabel}
        className={ACTION_BUTTON_CLASS}
      >
        {copyState === 'copied' ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDownload}
        aria-label={t('markdownTable.download', 'Download as CSV')}
        title={t('markdownTable.download', 'Download as CSV')}
        className={ACTION_BUTTON_CLASS}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </Button>
      {children}
    </div>
  );
}

export function MarkdownTable({ children }: { children?: React.ReactNode }) {
  const { t } = useUiTranslation('chat');
  const tableRef = useRef<HTMLTableElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    const table = tableRef.current;
    if (!table) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(toTsv(readTableData(table)));
      setCopyState('copied');
      resetTimer.current = setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
      resetTimer.current = setTimeout(() => setCopyState('idle'), 4000);
    }
  }, []);

  const handleDownload = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    downloadTextFile(toCsv(readTableData(table)), 'table.csv', 'text/csv;charset=utf-8');
  }, []);

  const tableLabel = t('markdownTable.label', 'Table');
  const expandLabel = t('markdownTable.expand', 'Expand table');

  return (
    <div className="group/table my-3">
      <div className="mb-1 flex justify-end opacity-0 transition-opacity group-focus-within/table:opacity-100 group-hover/table:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
        <TableActions onCopy={handleCopy} onDownload={handleDownload} copyState={copyState}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(true)}
            aria-label={expandLabel}
            title={expandLabel}
            className={ACTION_BUTTON_CLASS}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TableActions>
      </div>
      <div
        className="max-h-[min(70vh,40rem)] max-w-full overflow-x-auto overflow-y-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        role="region"
        aria-label={tableLabel}
        tabIndex={0}
      >
        <table ref={tableRef} className={TABLE_CLASS}>
          {children}
        </table>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          hideCloseButton
          disableAnimation
          aria-describedby={undefined}
          className="inset-4 flex w-auto max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden bg-background p-0 backdrop-blur-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border py-2 ps-4 pe-2">
            <DialogTitle className="text-sm font-semibold">{tableLabel}</DialogTitle>
            <TableActions onCopy={handleCopy} onDownload={handleDownload} copyState={copyState}>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t('markdownTable.close', 'Close expanded table')}
                  title={t('markdownTable.close', 'Close expanded table')}
                  className={ACTION_BUTTON_CLASS}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DialogClose>
            </TableActions>
          </div>
          <div
            className="min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]"
            role="region"
            aria-label={tableLabel}
            tabIndex={0}
          >
            <table className={TABLE_CLASS}>{children}</table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
