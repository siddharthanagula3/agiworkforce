import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { Artifact } from '@/types/chat';
import { Download, FileSpreadsheet } from 'lucide-react';
import React, { useCallback, useState } from 'react';

interface SpreadsheetData {
  columns: string[];
  rows: Record<string, string | number>[];
}

interface SpreadsheetArtifactProps {
  artifact: Artifact;
  className?: string;
  readOnly?: boolean;
}

export function SpreadsheetArtifact({
  artifact,
  className,
  readOnly = false,
}: SpreadsheetArtifactProps) {
  const [data, setData] = useState<SpreadsheetData | null>(() => {
    try {
      const parsed = JSON.parse(artifact.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          columns: Object.keys(parsed[0]),
          rows: parsed,
        };
      }
      return null;
    } catch {
      return null;
    }
  });

  const [editValue, setEditValue] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ r: number; c: string } | null>(null);

  const handleDownloadCsv = useCallback(() => {
    if (!data) return;

    const headers = data.columns.join(',');
    const rows = data.rows
      .map((row) =>
        data.columns
          .map((col) => {
            const val = String(row[col] ?? '');

            return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
          })
          .join(','),
      )
      .join('\n');

    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${artifact.title || 'spreadsheet'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data, artifact.title]);

  const handleCellClick = (r: number, c: string, val: string | number) => {
    if (readOnly) return;
    setEditingCell({ r, c });
    setEditValue(String(val));
  };

  const handleCellBlur = () => {
    if (!editingCell || !data) return;

    const newRows = [...data.rows];
    const targetRow = newRows[editingCell.r];

    if (targetRow) {
      newRows[editingCell.r] = {
        ...targetRow,
        [editingCell.c]: editValue || '',
      };

      setData({
        ...data,
        rows: newRows,
      });
    }

    setEditingCell(null);
    setEditValue(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    }
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground border border-dashed rounded-lg">
        <FileSpreadsheet className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Invalid spreadsheet data</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white dark:bg-zinc-950 border rounded-lg overflow-hidden',
        className,
      )}
    >
      {}
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Sheet</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {data.rows.length} rows • {data.columns.length} columns
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleDownloadCsv}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {}
      <div className="flex-1 overflow-auto relative custom-scrollbar bg-white dark:bg-zinc-950">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 shadow-xs ring-1 ring-zinc-200 dark:ring-zinc-800">
            <tr>
              <th className="w-10 border-r border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-1 text-center text-[10px] text-muted-foreground font-medium select-none">
                #
              </th>
              {data.columns.map((col) => (
                <th
                  key={col}
                  className="min-w-[120px] border-r border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 p-2 text-left font-semibold text-xs text-zinc-700 dark:text-zinc-300 select-none whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="group">
                <td className="border-r border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-1 text-center text-[10px] text-muted-foreground font-mono select-none group-hover:bg-zinc-100 dark:group-hover:bg-zinc-800/50 transition-colors">
                  {rowIndex + 1}
                </td>
                {data.columns.map((col) => {
                  const isEditing = editingCell?.r === rowIndex && editingCell?.c === col;
                  const value = row[col];

                  return (
                    <td
                      key={`${rowIndex}-${col}`}
                      className={cn(
                        'border-r border-b border-zinc-100 dark:border-zinc-800 p-0 min-w-[120px] relative transition-colors',
                        !isEditing &&
                          'hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer',
                        isEditing && 'ring-2 ring-blue-500 z-20 shadow-lg',
                      )}
                      onClick={() => handleCellClick(rowIndex, col, value ?? '')}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          className="w-full h-full px-2 py-1.5 bg-white dark:bg-zinc-900 text-sm focus:outline-hidden text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                          value={editValue || ''}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <div className="px-2 py-1.5 truncate text-zinc-700 dark:text-zinc-300 text-xs">
                          {String(value ?? '')}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {}
      {!readOnly && (
        <div className="border-t bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground flex justify-between">
          <span>Click cells to edit</span>
          <span>{readOnly ? 'Read Only' : 'Editable'}</span>
        </div>
      )}
    </div>
  );
}
