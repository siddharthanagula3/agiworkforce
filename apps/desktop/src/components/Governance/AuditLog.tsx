/**
 * AuditLog
 *
 * Displays a chronological audit log of approval events (approved/denied/timed out).
 * Sources data from the toolStore pendingApprovals history and actionLog.
 */
import React, { useMemo, useState } from 'react';
import { CheckCircle, Clock, Search, XCircle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useToolStore } from '../../stores/chat/toolStore';
import { cn } from '../../lib/utils';

const EVENT_ICONS = {
  approval: CheckCircle,
  rejected: XCircle,
  timeout: Clock,
  default: Clock,
};

const EVENT_COLORS: Record<string, string> = {
  approval: 'text-emerald-400',
  mcp: 'text-blue-400',
  terminal: 'text-amber-400',
  filesystem: 'text-violet-400',
  browser: 'text-cyan-400',
  ui: 'text-pink-400',
  plan: 'text-gray-400',
  metrics: 'text-gray-400',
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

interface AuditLogProps {
  className?: string;
}

export const AuditLog: React.FC<AuditLogProps> = ({ className }) => {
  const { actionLog } = useToolStore(useShallow((state) => ({ actionLog: state.actionLog })));

  const [searchTerm, setSearchTerm] = useState('');

  // Filter to approval-relevant entries
  const auditEntries = useMemo(() => {
    return actionLog
      .filter((e) => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          return (
            e.title.toLowerCase().includes(q) ||
            (e.description ?? '').toLowerCase().includes(q) ||
            e.type.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .slice(0, 200); // cap for performance
  }, [actionLog, searchTerm]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search audit log..."
          className="w-full rounded-lg border border-gray-700 bg-gray-900 pl-8 py-1.5 pr-4 text-xs text-gray-200 placeholder:text-gray-600 focus:border-gray-600 focus:outline-none"
        />
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-gray-800 bg-[#0c0e18] overflow-hidden">
        {auditEntries.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-600">
            {actionLog.length === 0
              ? 'No events recorded yet.'
              : 'No events match the search query.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-[500px] overflow-y-auto">
            {auditEntries.map((entry) => {
              const typeColor =
                EVENT_COLORS[entry.type] ?? EVENT_COLORS['metrics'] ?? 'text-gray-400';
              const StatusIcon = entry.type === 'approval' ? CheckCircle : EVENT_ICONS['default'];

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-800/20 transition-colors"
                >
                  <StatusIcon size={14} className={cn('mt-0.5 shrink-0', typeColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-200 truncate">
                        {entry.title}
                      </span>
                      <span className="text-[10px] text-gray-500 shrink-0 whitespace-nowrap">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={cn(
                          'text-[10px] font-medium capitalize px-1.5 py-0.5 rounded-full bg-current/10',
                          typeColor,
                        )}
                      >
                        {entry.type}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] capitalize',
                          entry.status === 'success'
                            ? 'text-emerald-400'
                            : entry.status === 'failed'
                              ? 'text-red-400'
                              : 'text-gray-500',
                        )}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-600">
        Showing up to 200 most recent events. Use the Tool History tab to export.
      </p>
    </div>
  );
};

export default AuditLog;
