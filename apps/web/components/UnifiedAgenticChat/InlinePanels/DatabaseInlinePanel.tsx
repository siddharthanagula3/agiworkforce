/**
 * DatabaseInlinePanel Component
 *
 * Displays database query results with table view, pagination,
 * and query metadata.
 */

import React, { memo, useState } from 'react';
import { Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { InlinePanel as InlinePanelType } from '@/stores/unified/unifiedChatStore';
import { InlinePanel } from './InlinePanel';

export interface DatabaseInlinePanelProps {
  panel: InlinePanelType;
  onToggleCollapse: () => void;
  messageId?: string;
}

const ROWS_PER_PAGE = 10;

const DatabaseInlinePanelComponent: React.FC<DatabaseInlinePanelProps> = memo(
  ({ panel, onToggleCollapse }) => {
    const [currentPage, setCurrentPage] = useState(0);
    const dbContent = panel.content.database;

    if (!dbContent) {
      return null;
    }

    const handleCopyQuery = () => {
      navigator.clipboard.writeText(dbContent.query);
      toast.success('Query copied to clipboard');
    };

    const handleExportCSV = () => {
      if (!dbContent.results) return;

      const { columns, rows } = dbContent.results;
      const csv = [
        columns.join(','),
        ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'query-results.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Results exported as CSV');
    };

    const results = dbContent.results;
    const totalRows = results?.rowCount ?? 0;
    const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
    const paginatedRows = results?.rows.slice(
      currentPage * ROWS_PER_PAGE,
      (currentPage + 1) * ROWS_PER_PAGE,
    );

    return (
      <InlinePanel panel={panel} onToggleCollapse={onToggleCollapse} onClose={() => {}}>
        <div className="space-y-3">
          {/* Query */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Query
              </span>
              <button
                onClick={handleCopyQuery}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors text-gray-600 dark:text-gray-400"
                title="Copy query"
              >
                <Copy size={12} />
              </button>
            </div>
            <div className="bg-blue-950 dark:bg-blue-950/50 rounded p-3 font-mono text-sm text-blue-100 overflow-x-auto border border-blue-700 dark:border-blue-800">
              <pre className="whitespace-pre-wrap break-words text-xs">{dbContent.query}</pre>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex gap-4 flex-wrap">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400 block">Rows</span>
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {totalRows.toLocaleString()}
              </span>
            </div>
            {dbContent.executionTime !== undefined && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400 block">
                  Execution Time
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {dbContent.executionTime}ms
                </span>
              </div>
            )}
          </div>

          {/* Results Table */}
          {results && results.columns.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Results
                </span>
                <button
                  onClick={handleExportCSV}
                  className="text-xs px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors text-gray-600 dark:text-gray-400"
                  title="Export as CSV"
                >
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-charcoal-700 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {results.columns.map((col, idx) => (
                        <th
                          key={idx}
                          className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 text-xs whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedRows && paginatedRows.length > 0 ? (
                      paginatedRows.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="hover:bg-gray-50 dark:hover:bg-charcoal-700/50 transition-colors"
                        >
                          {row.map((cell, cellIdx) => (
                            <td
                              key={cellIdx}
                              className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs max-w-xs truncate"
                              title={String(cell)}
                            >
                              {cell === null
                                ? '∅'
                                : cell === undefined
                                  ? '-'
                                  : typeof cell === 'boolean'
                                    ? cell
                                      ? '✓'
                                      : '✗'
                                    : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={results.columns.length}
                          className="px-3 py-8 text-center text-gray-500"
                        >
                          No results
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                      disabled={currentPage === totalPages - 1}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-charcoal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : dbContent.error ? (
            <div className="flex items-center justify-center py-8 bg-red-100 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
              <div>
                <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">
                  Query Error
                </div>
                <div className="text-xs text-red-600 dark:text-red-400 font-mono">
                  {dbContent.error}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 bg-gray-100 dark:bg-charcoal-700 rounded border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">No results</span>
            </div>
          )}
        </div>
      </InlinePanel>
    );
  },
);

DatabaseInlinePanelComponent.displayName = 'DatabaseInlinePanel';

export { DatabaseInlinePanelComponent as DatabaseInlinePanel };
