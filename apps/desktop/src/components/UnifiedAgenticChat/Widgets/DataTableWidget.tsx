/**
 * DataTableWidget Component
 *
 * Interactive data table widget with sorting and filtering capabilities.
 * Displays tabular data in a clean, responsive format.
 *
 * @module Widgets/DataTableWidget
 */

import React, { memo, useState, useMemo, useCallback } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Table,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { WidgetRegistry } from './WidgetRegistry';
import type { DataTableWidgetData, WidgetRendererProps, WidgetActionEvent } from './index';

// ============================================================================
// Types
// ============================================================================

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  column: string | null;
  direction: SortDirection;
}

// ============================================================================
// Component
// ============================================================================

const DataTableWidgetComponent: React.FC<WidgetRendererProps<DataTableWidgetData>> = ({
  widget,
  onAction,
}) => {
  const { columns, rows, sortable = true, filterable = true, pageSize = 10, totalRows } = widget;

  // Local state
  const [sortState, setSortState] = useState<SortState>({ column: null, direction: null });
  const [filterQuery, setFilterQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  // Emit action event
  const emitAction = useCallback(
    (action: string, payload?: unknown) => {
      const event: WidgetActionEvent = {
        widgetId: widget.id,
        action,
        payload,
      };
      onAction?.(event);
    },
    [widget.id, onAction],
  );

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!filterQuery.trim()) return rows;

    const query = filterQuery.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const value = row[col.key];
        if (value == null) return false;
        return String(value).toLowerCase().includes(query);
      }),
    );
  }, [rows, columns, filterQuery]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortState.column || !sortState.direction) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortState.column!];
      const bVal = b[sortState.column!];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortState.direction === 'asc' ? -1 : 1;
      if (bVal == null) return sortState.direction === 'asc' ? 1 : -1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortState]);

  // Paginate rows
  const paginatedRows = useMemo(() => {
    const start = currentPage * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  // Pagination info
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const displayedTotal = totalRows ?? rows.length;
  const startRow = currentPage * pageSize + 1;
  const endRow = Math.min((currentPage + 1) * pageSize, sortedRows.length);

  // Handle sort click
  const handleSort = useCallback(
    (columnKey: string) => {
      setSortState((prev) => {
        let newDirection: SortDirection;
        if (prev.column !== columnKey) {
          newDirection = 'asc';
        } else if (prev.direction === 'asc') {
          newDirection = 'desc';
        } else {
          newDirection = null;
        }

        emitAction('sort', { column: columnKey, direction: newDirection });

        return {
          column: newDirection ? columnKey : null,
          direction: newDirection,
        };
      });
      setCurrentPage(0); // Reset to first page on sort
    },
    [emitAction],
  );

  // Handle filter change
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFilterQuery(value);
      setCurrentPage(0); // Reset to first page on filter
      emitAction('filter', { query: value });
    },
    [emitAction],
  );

  // Handle row click
  const handleRowClick = useCallback(
    (row: Record<string, unknown>, index: number) => {
      emitAction('row-click', { row, index });
    },
    [emitAction],
  );

  // Format cell value for display
  const formatCellValue = (value: unknown): string => {
    if (value == null) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  };

  // Get sort icon
  const getSortIcon = (columnKey: string) => {
    if (sortState.column !== columnKey) {
      return <ArrowUpDown size={14} className="opacity-50" />;
    }
    if (sortState.direction === 'asc') {
      return <ArrowUp size={14} />;
    }
    return <ArrowDown size={14} />;
  };

  return (
    <div className="space-y-3">
      {/* Filter input */}
      {filterable && (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={filterQuery}
            onChange={handleFilterChange}
            placeholder="Filter rows..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-800">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'px-4 py-3 font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right',
                    sortable &&
                      column.sortable !== false &&
                      'cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700',
                  )}
                  style={{ width: column.width }}
                  onClick={() => {
                    if (sortable && column.sortable !== false) {
                      handleSort(column.key);
                    }
                  }}
                >
                  <div
                    className={cn(
                      'flex items-center gap-2',
                      column.align === 'center' && 'justify-center',
                      column.align === 'right' && 'justify-end',
                    )}
                  >
                    <span>{column.label}</span>
                    {sortable && column.sortable !== false && getSortIcon(column.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  {filterQuery ? 'No matching rows found' : 'No data available'}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  onClick={() => handleRowClick(row, currentPage * pageSize + rowIndex)}
                  className="border-t border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 text-zinc-700 dark:text-zinc-300',
                        column.align === 'center' && 'text-center',
                        column.align === 'right' && 'text-right',
                      )}
                    >
                      {formatCellValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sortedRows.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            Showing {startRow}-{endRow} of {sortedRows.length}
            {displayedTotal !== sortedRows.length && ` (${displayedTotal} total)`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

DataTableWidgetComponent.displayName = 'DataTableWidget';

export const DataTableWidget = memo(DataTableWidgetComponent);

// Register the widget
WidgetRegistry.register({
  type: 'data-table',
  displayName: 'Data Table',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- widget registration: props vary by API
  component: DataTableWidget as React.ComponentType<any>,
  icon: Table,
});
