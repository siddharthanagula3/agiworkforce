/**
 * OperatorDrillDown
 *
 * A rich operator view for a single agent task run:
 * - Summary card: total duration, tokens used, tools called, approvals, success/fail ratio
 * - Expandable sections: tool calls, approvals, errors, artifacts produced
 * - Cost breakdown: estimated cost per tool call and total run cost
 * - Operator Notes: free-text annotation field persisted in local state
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  MessageSquare,
  Package,
  Shield,
  Terminal,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToolStore, selectActionLog, type ActionLogEntry } from '../../stores/chat/toolStore';
import type { AgentTask } from '../../stores/agentTaskStore';

// ── Cost estimation ───────────────────────────────────────────────────────────

const TOOL_COST_ESTIMATES: Record<string, number> = {
  plan: 0.002,
  terminal: 0.001,
  filesystem: 0.0005,
  browser: 0.005,
  ui: 0.001,
  mcp: 0.002,
  approval: 0.0,
  metrics: 0.0,
};

function estimateCost(entry: ActionLogEntry): number {
  return TOOL_COST_ESTIMATES[entry.type] ?? 0.001;
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// ── Summary stat card ─────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', color ?? 'text-muted-foreground')} />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <span className={cn('text-lg font-semibold tabular-nums', color ?? 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

// ── Expandable section ────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ElementType;
  count: number;
  badgeColor?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function Section({
  title,
  icon: Icon,
  count,
  badgeColor,
  children,
  defaultExpanded = false,
}: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="rounded-lg border border-white/[0.06] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{title}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
            badgeColor ?? 'bg-white/10 text-muted-foreground',
          )}
        >
          {count}
        </span>
      </button>
      {expanded && <div className="border-t border-white/[0.06] bg-white/[0.01]">{children}</div>}
    </div>
  );
}

// ── Tool call row ─────────────────────────────────────────────────────────────

function ToolCallRow({ entry, cost }: { entry: ActionLogEntry; cost: number }) {
  const isSuccess = entry.status === 'success';
  const isFailed = entry.status === 'failed';
  const durationMs = entry.metadata?.['duration_ms'] as number | undefined;

  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition">
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          isSuccess ? 'bg-green-400/10' : isFailed ? 'bg-red-400/10' : 'bg-white/10',
        )}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-3 w-3 text-green-400" />
        ) : isFailed ? (
          <XCircle className="h-3 w-3 text-red-400" />
        ) : (
          <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground/80">{entry.title}</span>
          {durationMs !== undefined && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums">
              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {cost > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
              ~{formatCost(cost)}
            </span>
          )}
        </div>
        {entry.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{entry.description}</p>
        )}
        {entry.error && <p className="mt-0.5 text-[11px] text-red-400/80">{entry.error}</p>}
      </div>
    </div>
  );
}

// ── Approval row ──────────────────────────────────────────────────────────────

function ApprovalRow({ entry }: { entry: ActionLogEntry }) {
  const riskLevel = entry.metadata?.['riskLevel'] as string | undefined;
  const approved = entry.status === 'success';
  const timedOut = entry.metadata?.['timedOut'] as boolean | undefined;

  const riskColors: Record<string, string> = {
    high: 'text-red-400 bg-red-400/10',
    medium: 'text-amber-400 bg-amber-400/10',
    low: 'text-green-400 bg-green-400/10',
  };

  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-b-0">
      <Shield
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          approved ? 'text-green-400' : timedOut ? 'text-orange-400' : 'text-red-400',
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/80">{entry.title}</span>
          {riskLevel && (
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide',
                riskColors[riskLevel] ?? riskColors['low']!,
              )}
            >
              {riskLevel}
            </span>
          )}
          <span
            className={cn(
              'ml-auto text-[10px] font-medium',
              approved ? 'text-green-400' : timedOut ? 'text-orange-400' : 'text-red-400',
            )}
          >
            {approved ? 'Approved' : timedOut ? 'Timed out' : 'Denied'}
          </span>
        </div>
        {entry.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.description}</p>
        )}
      </div>
    </div>
  );
}

// ── Cost breakdown table ──────────────────────────────────────────────────────

interface CostBreakdownProps {
  entries: ActionLogEntry[];
}

function CostBreakdown({ entries }: CostBreakdownProps) {
  const byType = useMemo(() => {
    const map = new Map<string, { count: number; cost: number }>();
    for (const entry of entries) {
      const cost = estimateCost(entry);
      const existing = map.get(entry.type) ?? { count: 0, cost: 0 };
      map.set(entry.type, { count: existing.count + 1, cost: existing.cost + cost });
    }
    return Array.from(map.entries())
      .filter(([, v]) => v.cost > 0)
      .sort((a, b) => b[1].cost - a[1].cost);
  }, [entries]);

  const total = byType.reduce((sum, [, v]) => sum + v.cost, 0);

  if (byType.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-muted-foreground">No billable tool calls recorded</p>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="space-y-1.5">
        {byType.map(([type, { count, cost }]) => (
          <div key={type} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 capitalize text-muted-foreground">{type}</span>
            <span className="text-muted-foreground/60 tabular-nums">{count}x</span>
            <div className="flex-1 rounded-full bg-white/5 h-1">
              <div
                className="h-1 rounded-full bg-primary/60"
                style={{ width: `${Math.min(100, (cost / total) * 100)}%` }}
              />
            </div>
            <span className="shrink-0 font-mono tabular-nums text-foreground/70">
              {formatCost(cost)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.06] pt-2 text-xs">
        <span className="font-medium text-muted-foreground">Estimated total</span>
        <span className="font-semibold font-mono text-foreground">{formatCost(total)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/50">
        Cost estimates are approximate. Actual costs depend on model and token usage.
      </p>
    </div>
  );
}

// ── Operator Notes ────────────────────────────────────────────────────────────

interface OperatorNotesProps {
  taskId: string;
}

const NOTES_MAX_LENGTH = 5000;
const NOTES_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function pruneStaleOperatorNotes(): void {
  try {
    const cutoff = Date.now() - NOTES_MAX_AGE_MS;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('operator-notes-')) continue;
      const metaKey = `${key}__ts`;
      const ts = Number(localStorage.getItem(metaKey) ?? '0');
      if (ts > 0 && ts < cutoff) {
        keysToRemove.push(key, metaKey);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // localStorage unavailable — ignore
  }
}

function OperatorNotes({ taskId }: OperatorNotesProps) {
  const storageKey = `operator-notes-${taskId}`;
  const tsKey = `${storageKey}__ts`;
  const [note, setNote] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  const [saved, setSaved] = useState(false);

  // Prune notes older than 30 days on mount
  useEffect(() => {
    pruneStaleOperatorNotes();
  }, []);

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem(storageKey, note.slice(0, NOTES_MAX_LENGTH));
      localStorage.setItem(tsKey, String(Date.now()));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[OperatorNotes] Failed to save:', err);
    }
  }, [note, storageKey, tsKey]);

  return (
    <div className="px-4 py-3 space-y-2">
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value.slice(0, NOTES_MAX_LENGTH));
          setSaved(false);
        }}
        placeholder="Add operator notes, observations, or follow-up actions..."
        rows={4}
        maxLength={NOTES_MAX_LENGTH}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span className="text-[10px] text-muted-foreground/40 text-right tabular-nums">
        {note.length}/{NOTES_MAX_LENGTH}
      </span>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50">
          Notes are saved locally on this device
        </span>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md bg-primary/90 px-3 py-1 text-xs font-medium text-primary-foreground transition hover:bg-primary"
        >
          {saved ? <CheckCircle2 className="h-3 w-3" /> : null}
          {saved ? 'Saved' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface OperatorDrillDownProps {
  task: AgentTask;
  className?: string;
}

export function OperatorDrillDown({ task, className }: OperatorDrillDownProps) {
  const actionLog = useToolStore(selectActionLog);

  // In a production version, entries would be filtered by task ID via embedded taskId in log entries.
  // For now we use all entries (same as ActionTimeline), consistent with the existing design.
  const allEntries = actionLog;

  const toolCallEntries = useMemo(
    () => allEntries.filter((e) => e.type !== 'approval'),
    [allEntries],
  );
  const approvalEntries = useMemo(
    () => allEntries.filter((e) => e.type === 'approval'),
    [allEntries],
  );
  const errorEntries = useMemo(
    () => allEntries.filter((e) => e.status === 'failed' || Boolean(e.error)),
    [allEntries],
  );
  const artifactEntries = useMemo(
    () => allEntries.filter((e) => e.status === 'success' && e.result),
    [allEntries],
  );

  const totalCost = useMemo(
    () => allEntries.reduce((sum, e) => sum + estimateCost(e), 0),
    [allEntries],
  );

  const successRate =
    toolCallEntries.length > 0
      ? Math.round(
          (toolCallEntries.filter((e) => e.status === 'success').length / toolCallEntries.length) *
            100,
        )
      : null;

  const duration = formatDuration(task.createdAt, task.completedAt);

  return (
    <div className={cn('flex flex-col gap-4 px-4 py-4', className)}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard icon={Clock} label="Duration" value={duration} />
        <StatCard
          icon={Terminal}
          label="Tool Calls"
          value={toolCallEntries.length}
          color="text-blue-400"
        />
        <StatCard
          icon={Shield}
          label="Approvals"
          value={approvalEntries.length}
          color="text-amber-400"
        />
        {successRate !== null ? (
          <StatCard
            icon={CheckCircle2}
            label="Success Rate"
            value={`${successRate}%`}
            color={successRate >= 80 ? 'text-green-400' : 'text-amber-400'}
          />
        ) : (
          <StatCard icon={DollarSign} label="Est. Cost" value={formatCost(totalCost)} />
        )}
      </div>

      {/* Tool Calls section */}
      <Section
        title="Tool Calls"
        icon={Terminal}
        count={toolCallEntries.length}
        badgeColor="bg-blue-400/10 text-blue-400"
        defaultExpanded={toolCallEntries.length > 0}
      >
        {toolCallEntries.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">No tool calls recorded</p>
        ) : (
          toolCallEntries.map((entry) => (
            <ToolCallRow key={entry.id} entry={entry} cost={estimateCost(entry)} />
          ))
        )}
      </Section>

      {/* Approvals section */}
      {approvalEntries.length > 0 && (
        <Section
          title="Approvals"
          icon={Shield}
          count={approvalEntries.length}
          badgeColor="bg-amber-400/10 text-amber-400"
        >
          {approvalEntries.map((entry) => (
            <ApprovalRow key={entry.id} entry={entry} />
          ))}
        </Section>
      )}

      {/* Errors section */}
      {errorEntries.length > 0 && (
        <Section
          title="Errors"
          icon={AlertCircle}
          count={errorEntries.length}
          badgeColor="bg-red-400/10 text-red-400"
          defaultExpanded
        >
          {errorEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-b-0"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground/80">{entry.title}</p>
                {(entry.error ?? entry.description) && (
                  <p className="mt-0.5 text-[11px] text-red-400/80">
                    {entry.error ?? entry.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Artifacts section */}
      {artifactEntries.length > 0 && (
        <Section
          title="Artifacts Produced"
          icon={Package}
          count={artifactEntries.length}
          badgeColor="bg-green-400/10 text-green-400"
        >
          {artifactEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-b-0"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground/80">{entry.title}</p>
                {entry.result && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Cost breakdown section */}
      <Section
        title="Cost Breakdown"
        icon={DollarSign}
        count={0}
        badgeColor="bg-muted text-muted-foreground"
      >
        <CostBreakdown entries={allEntries} />
      </Section>

      {/* Operator Notes section */}
      <Section
        title="Operator Notes"
        icon={MessageSquare}
        count={0}
        badgeColor="bg-muted text-muted-foreground"
        defaultExpanded
      >
        <OperatorNotes taskId={task.id} />
      </Section>
    </div>
  );
}
