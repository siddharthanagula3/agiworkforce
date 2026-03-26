import {
  Database,
  Copy,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  Check,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';

export interface DatabaseResultData {
  query: string;
  columns?: string[];
  rows?: (string | number | null | boolean)[][];
  rowCount?: number;
  affectedRows?: number;
  executionTimeMs?: number;
  success?: boolean;
  error?: string;
  database?: string;
  operation?: 'select' | 'insert' | 'update' | 'delete' | 'query';
}

export const InlineDatabaseResults: React.FC<ToolResultProps> = ({ result, status }) => {
  const [expanded, setExpanded] = useState(false);

  const data = result?.data as DatabaseResultData | undefined;

  // Show running state
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Executing query...</span>
      </div>
    );
  }

  // Show error state if status indicates failure
  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-300 font-medium">Database operation failed</p>
            {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    query,
    columns = [],
    rows = [],
    rowCount = rows.length,
    affectedRows,
    executionTimeMs,
    success = true,
    error,
    database,
    operation = 'query',
  } = data;

  // Error state
  if (!success || error) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Query failed</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {error || 'Unknown error'}
            </p>
            {query && (
              <pre className="text-xs text-muted-foreground mt-2 bg-surface-base/50 p-2 rounded overflow-auto">
                {query}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }

  const previewRows = rows.slice(0, 3);
  const hasMoreRows = rows.length > 3;

  const operationLabel =
    operation === 'select'
      ? 'SELECT'
      : operation === 'insert'
        ? 'INSERT'
        : operation === 'update'
          ? 'UPDATE'
          : operation === 'delete'
            ? 'DELETE'
            : 'QUERY';

  const operationColor =
    operation === 'select'
      ? 'text-blue-400'
      : operation === 'insert'
        ? 'text-emerald-400'
        : operation === 'update'
          ? 'text-amber-400'
          : operation === 'delete'
            ? 'text-red-400'
            : 'text-muted-foreground';

  return (
    <div className="inline-database-results mt-3 rounded-lg border border-border/50 overflow-hidden bg-surface-elevated">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={`text-xs font-mono font-medium ${operationColor}`}>
            {operationLabel}
          </span>
          {database && (
            <span className="text-xs text-muted-foreground truncate">from {database}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-muted-foreground">
            {affectedRows !== undefined ? `${affectedRows} affected` : `${rowCount} rows`}
          </span>
          {executionTimeMs !== undefined && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {executionTimeMs}ms
            </span>
          )}

          {(hasMoreRows || columns.length > 0) && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="h-6 w-6 p-0"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}

          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              const csvContent = [
                columns.join(','),
                ...rows.map((row) => row.map((cell) => `"${String(cell ?? '')}"`).join(',')),
              ].join('\n');
              void navigator.clipboard.writeText(csvContent).catch(() => {});
              toast.success('Results copied as CSV', {
                icon: <Check className="h-4 w-4" />,
                duration: 2000,
              });
            }}
            className="h-6 w-6 p-0"
            title="Copy as CSV"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Query Preview */}
      {query && !expanded && (
        <div className="px-3 py-2 bg-surface-base/50 border-b border-border/30">
          <pre className="text-xs text-muted-foreground font-mono line-clamp-1">{query}</pre>
        </div>
      )}

      {/* Table Preview */}
      {columns.length > 0 && previewRows.length > 0 && !expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-overlay/50">
              <tr>
                {columns.slice(0, 5).map((col, i) => (
                  <th
                    key={i}
                    className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-border/30"
                  >
                    {col}
                  </th>
                ))}
                {columns.length > 5 && (
                  <th className="px-2 py-1.5 text-left text-muted-foreground border-b border-border/30">
                    +{columns.length - 5} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  {row.slice(0, 5).map((cell, j) => (
                    <td
                      key={j}
                      className="px-2 py-1.5 text-muted-foreground truncate max-w-[150px]"
                    >
                      {cell === null ? (
                        <span className="text-muted-foreground italic">NULL</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                  {row.length > 5 && <td className="px-2 py-1.5 text-muted-foreground">...</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {hasMoreRows && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground bg-surface-base/30">
              +{rows.length - 3} more rows
            </div>
          )}
        </div>
      )}

      {/* Expanded View */}
      {expanded && (
        <div className="p-3 space-y-3 max-h-96 overflow-auto bg-surface-base/30">
          {/* Full Query */}
          {query && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Query</div>
              <pre className="text-xs font-mono text-foreground bg-surface-base rounded p-2 overflow-auto whitespace-pre-wrap">
                {query}
              </pre>
            </div>
          )}

          {/* Full Table */}
          {columns.length > 0 && rows.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Results ({rowCount} rows)
              </div>
              <div className="overflow-x-auto border border-border/30 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-surface-overlay/50 sticky top-0">
                    <tr>
                      {columns.map((col, i) => (
                        <th
                          key={i}
                          className="px-2 py-1.5 text-left font-medium text-foreground border-b border-border/30 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/20 last:border-0 hover:bg-surface-overlay/30"
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="px-2 py-1.5 text-muted-foreground whitespace-nowrap"
                          >
                            {cell === null ? (
                              <span className="text-muted-foreground italic">NULL</span>
                            ) : typeof cell === 'boolean' ? (
                              <span className={cell ? 'text-emerald-400' : 'text-red-400'}>
                                {String(cell)}
                              </span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
