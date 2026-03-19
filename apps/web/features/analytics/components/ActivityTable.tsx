'use client';

import { useState } from 'react';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { cn } from '@shared/lib/utils';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface ActivityRow {
  id: string;
  taskName: string;
  agent: string;
  model: string;
  status: 'success' | 'failed' | 'running' | 'queued';
  durationMs: number;
  cost: number;
  startedAt: string;
}

type SortKey = keyof Pick<ActivityRow, 'startedAt' | 'durationMs' | 'cost' | 'status'>;
type SortDir = 'asc' | 'desc';

interface ActivityTableProps {
  data: ActivityRow[];
  pageSize?: number;
}

function StatusBadge({ status }: { status: ActivityRow['status'] }) {
  const config: Record<
    ActivityRow['status'],
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }
  > = {
    success: {
      label: 'Success',
      variant: 'default',
      icon: <CheckCircle className="h-3 w-3 text-emerald-500" />,
    },
    failed: {
      label: 'Failed',
      variant: 'destructive',
      icon: <XCircle className="h-3 w-3" />,
    },
    running: {
      label: 'Running',
      variant: 'secondary',
      icon: <Loader2 className="h-3 w-3 animate-spin text-blue-500" />,
    },
    queued: {
      label: 'Queued',
      variant: 'outline',
      icon: <Clock className="h-3 w-3 text-amber-500" />,
    },
  };

  const { label, variant, icon } = config[status];

  return (
    <Badge variant={variant} className="flex w-fit items-center gap-1 text-xs">
      {icon}
      {label}
    </Badge>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="ml-1 h-3 w-3 opacity-40" />;
  return sortDir === 'asc' ? (
    <ChevronUp className="ml-1 h-3 w-3" />
  ) : (
    <ChevronDown className="ml-1 h-3 w-3" />
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${(cost * 100).toFixed(2)}¢`;
  return `$${cost.toFixed(4)}`;
}

export function ActivityTable({ data, pageSize = 8 }: ActivityTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('startedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / pageSize);
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const thCls =
    'cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground';

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Task
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Agent
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
                Model
              </th>
              <th className={thCls} onClick={() => toggleSort('status')}>
                <span className="flex items-center">
                  Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </th>
              <th className={thCls} onClick={() => toggleSort('durationMs')}>
                <span className="flex items-center">
                  Duration <SortIcon col="durationMs" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </th>
              <th className={thCls} onClick={() => toggleSort('cost')}>
                <span className="flex items-center">
                  Cost <SortIcon col="cost" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </th>
              <th className={thCls} onClick={() => toggleSort('startedAt')}>
                <span className="flex items-center">
                  Started <SortIcon col="startedAt" sortKey={sortKey} sortDir={sortDir} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  'border-t border-border/30 transition-colors hover:bg-muted/30',
                  i % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                )}
              >
                <td className="max-w-[200px] truncate px-3 py-2.5 font-medium" title={row.taskName}>
                  {row.taskName}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{row.agent}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono">
                    {row.model}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatDuration(row.durationMs)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatCost(row.cost)}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {new Date(row.startedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No activity found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={cn(
                  'h-7 w-7 rounded-md text-xs transition-colors',
                  page === i
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
