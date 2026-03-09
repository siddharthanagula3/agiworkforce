/**
 * ToolHistoryTable
 *
 * Displays recent tool execution history with filtering by tool name,
 * status, and date range. Sources data from chat/toolStore's actionLog.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { Download, Filter, Search, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useToolStore } from '../../stores/chat/toolStore';
import type { ActionLogEntry } from '../../stores/chat/toolStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

const STATUS_COLORS: Record<string, string> = {
  success: 'text-emerald-400 bg-emerald-500/10',
  failed: 'text-red-400 bg-red-500/10',
  running: 'text-blue-400 bg-blue-500/10',
  pending: 'text-amber-400 bg-amber-500/10',
  blocked: 'text-gray-400 bg-gray-500/10',
};

function formatTimestamp(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportToCSV(entries: ActionLogEntry[]): void {
  const header = ['Timestamp', 'Tool', 'Type', 'Status', 'Description', 'Result', 'Error'].join(
    ',',
  );
  const rows = entries.map((e) =>
    [
      escapeCSV(formatTimestamp(e.createdAt)),
      escapeCSV(e.title),
      escapeCSV(e.type),
      escapeCSV(e.status),
      escapeCSV(e.description ?? ''),
      escapeCSV(e.result ?? ''),
      escapeCSV(e.error ?? ''),
    ].join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tool-history-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type StatusFilter = 'all' | 'success' | 'failed' | 'running' | 'pending' | 'blocked';

interface ToolHistoryTableProps {
  className?: string;
}

export const ToolHistoryTable: React.FC<ToolHistoryTableProps> = ({ className }) => {
  const { actionLog, clearActionLog } = useToolStore(
    useShallow((state) => ({
      actionLog: state.actionLog,
      clearActionLog: state.clearActionLog,
    })),
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Derive distinct types from the log
  const distinctTypes = useMemo(() => {
    const types = new Set(actionLog.map((e) => e.type));
    return ['all', ...Array.from(types)];
  }, [actionLog]);

  const filtered = useMemo(() => {
    return actionLog.filter((entry) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.description ?? '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      const matchesType = typeFilter === 'all' || entry.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [actionLog, searchTerm, statusFilter, typeFilter]);

  const handleExport = useCallback(() => {
    exportToCSV(filtered);
  }, [filtered]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tools..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-8 pr-8 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:border-gray-600 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-gray-500" />
          {(['all', 'success', 'failed', 'running', 'pending', 'blocked'] as StatusFilter[]).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
                  statusFilter === status
                    ? 'bg-gray-700 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300',
                )}
              >
                {status}
              </button>
            ),
          )}
        </div>

        {/* Type filter */}
        {distinctTypes.length > 2 && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:outline-none"
          >
            {distinctTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All types' : t}
              </option>
            ))}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-600">{filtered.length} entries</span>
          <Button
            size="xs"
            variant="outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="flex items-center gap-1"
          >
            <Download size={12} />
            Export CSV
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={clearActionLog}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-gray-800">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-600">
            {actionLog.length === 0
              ? 'No tool executions recorded yet.'
              : 'No results match the current filters.'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="px-3 py-2 text-left font-medium text-gray-500">Time</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Tool</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Description</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Result</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {formatTimestamp(entry.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-200 max-w-[140px] truncate">
                    {entry.title}
                  </td>
                  <td className="px-3 py-2 text-gray-400 capitalize">{entry.type}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                        STATUS_COLORS[entry.status] ?? 'text-gray-400 bg-gray-500/10',
                      )}
                    >
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate">
                    {entry.description ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-400 max-w-[160px] truncate">
                    {entry.error ? (
                      <span className="text-red-400">{entry.error}</span>
                    ) : (
                      (entry.result ?? '—')
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ToolHistoryTable;
