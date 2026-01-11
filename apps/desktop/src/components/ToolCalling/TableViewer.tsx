/**
 * TableViewer Component
 *
 * Display tabular data from database queries, API responses, or CSV data.
 * Supports sorting, filtering, pagination, and export to CSV.
 */

import { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Download,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import type { TableData } from '../../types/toolCalling';

interface TableViewerProps {
  data: TableData;
  className?: string;
  maxHeight?: string;
  paginated?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

export function TableViewer({
  data,
  className,
  maxHeight = '400px',
  paginated = true,
}: TableViewerProps) {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = data.page_size ?? 20;

  // Filter rows based on search term
  const filteredRows = useMemo(() => {
    if (!searchTerm) return data.rows;

    return data.rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    );
  }, [data.rows, searchTerm]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const aStr = String(aValue);
      const bStr = String(bValue);

      // Try numeric comparison first
      const aNum = Number(aValue);
      const bNum = Number(bValue);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Fall back to string comparison
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Paginate rows
  const paginatedRows = useMemo(() => {
    if (!paginated) return sortedRows;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sortedRows.slice(start, end);
  }, [sortedRows, currentPage, pageSize, paginated]);

  const totalPages = Math.ceil(sortedRows.length / pageSize);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const handleCopyTable = async () => {
    // Convert table to TSV (Tab-Separated Values)
    const headers = data.columns.map((col) => col.label).join('\t');
    const rows = sortedRows
      .map((row) => data.columns.map((col) => String(row[col.key] ?? '')).join('\t'))
      .join('\n');
    const tsv = `${headers}\n${rows}`;

    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCSV = () => {
    // Convert table to CSV
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const headers = data.columns.map((col) => escapeCSV(col.label)).join(',');
    const rows = sortedRows
      .map((row) => data.columns.map((col) => escapeCSV(String(row[col.key] ?? ''))).join(','))
      .join('\n');
    const csv = `${headers}\n${rows}`;

    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `export_${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const formatCellValue = (value: unknown, type?: string): string => {
    if (value === null || value === undefined) return '-';
    if (type === 'date' && typeof value === 'string') {
      try {
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    }
    if (type === 'boolean') {
      return value ? '✓' : '✗';
    }
    if (type === 'number' && typeof value === 'number') {
      return value.toLocaleString();
    }
    return String(value);
  };

  return (
    <div className={cn('border border-border rounded-lg bg-background overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Table ({sortedRows.length} rows)
          </span>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search table..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopyTable} className="h-7 px-2">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportCSV} className="h-7 px-2" title="Export CSV">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border">
            <tr>
              {data.columns.map((column) => (
                <th
                  key={column.key}
                  className="text-left px-3 py-2 font-semibold cursor-pointer hover:bg-muted/60 select-none group"
                  onClick={() => handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{column.label}</span>
                    <div className="w-4 h-4 flex items-center justify-center text-muted-foreground group-hover:text-foreground">
                      {sortColumn === column.key ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={data.columns.length} className="text-center py-8 text-muted-foreground">
                  No data found
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                >
                  {data.columns.map((column) => (
                    <td key={column.key} className="px-3 py-2 font-mono text-xs">
                      {formatCellValue(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30 text-xs">
          <div className="text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length} rows
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-7 px-2"
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="h-7 px-2"
            >
              Previous
            </Button>
            <span className="px-3 text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-7 px-2"
            >
              Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-7 px-2"
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
