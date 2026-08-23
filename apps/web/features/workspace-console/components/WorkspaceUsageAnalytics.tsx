'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';

import {
  useWorkspaceUsage,
  type UsageBreakdownRow,
  type UsageDayRow,
} from '../hooks/use-workspace-usage';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function compact(n: number): string {
  return n.toLocaleString();
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span
        className="text-[10px] font-medium uppercase tracking-[0.1em]"
        style={{ color: 'var(--text-3)' }}
      >
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>
        {value}
      </span>
      {note ? (
        <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {note}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A bar per day, sized against the busiest day in the window.
 *
 * Deliberately not a charting library: the shape an administrator needs from a
 * spend series is "is it flat or is it climbing", and that reads at a glance
 * from relative height without shipping a dependency to draw it.
 */
function Sparkline({ days }: { days: UsageDayRow[] }) {
  if (days.length === 0) return null;
  const peak = Math.max(...days.map((d) => d.costCents), 1);

  return (
    <div className="flex h-16 items-end gap-[2px] px-5 pb-4" role="img" aria-label="Daily spend">
      {days.map((day) => (
        <span
          key={day.day}
          title={`${new Date(day.day).toLocaleDateString()} — ${money(day.costCents)}`}
          style={{
            flex: 1,
            minWidth: 2,
            height: `${Math.max(2, (day.costCents / peak) * 100)}%`,
            background: 'var(--text-3)',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

function BreakdownTable({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: UsageBreakdownRow[];
}) {
  const headingId = `${title.toLowerCase().replace(/\s+/g, '-')}-heading`;

  return (
    <section style={cardStyle} aria-labelledby={headingId}>
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
        <h2 id={headingId} className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {title}
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {caption}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
          Nothing in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-3)' }}>
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 text-right font-medium">Turns</th>
                <th className="px-5 py-2 text-right font-medium">Tokens in</th>
                <th className="px-5 py-2 text-right font-medium">Tokens out</th>
                <th className="px-5 py-2 text-right font-medium">Spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} style={{ borderTop: '1px solid var(--settings-border)' }}>
                  <td
                    className="max-w-[16rem] truncate px-5 py-2.5"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {row.key}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {compact(row.requests)}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {compact(row.inputTokens)}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-2)' }}
                  >
                    {compact(row.outputTokens)}
                  </td>
                  <td
                    className="px-5 py-2.5 text-right tabular-nums"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {money(row.costCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function WorkspaceUsageAnalytics() {
  const [days, setDays] = useState<number>(30);
  const { data, isPending, isError, error, refetch } = useWorkspaceUsage(days);

  if (isPending) {
    return (
      <div
        role="status"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        Loading workspace usage…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load your workspace usage
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          You do not administer this workspace
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          Per-member spend is limited to owners and admins.
        </p>
      </div>
    );
  }

  const { usage } = data;
  const empty = usage.totals.requests === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((window) => (
          <button
            key={window.days}
            type="button"
            aria-pressed={days === window.days}
            onClick={() => setDays(window.days)}
            className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              borderColor: days === window.days ? 'currentColor' : 'var(--settings-border)',
              color: days === window.days ? 'var(--text-1)' : 'var(--text-3)',
            }}
          >
            {window.label}
          </button>
        ))}
      </div>

      <section style={cardStyle} aria-labelledby="totals-heading">
        <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
          <h2
            id="totals-heading"
            className="text-sm font-semibold"
            style={{ color: 'var(--text-1)' }}
          >
            Managed cloud spend
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Settled turns only. A reservation that was declined or is still in flight has cost
            nothing and is not counted.
          </p>
        </div>
        <div
          className="grid grid-cols-2 divide-x md:grid-cols-4"
          style={{ borderColor: 'var(--settings-border)' }}
        >
          <Stat label="Spend" value={money(usage.totals.costCents)} />
          <Stat label="Turns" value={compact(usage.totals.requests)} />
          <Stat label="Tokens in" value={compact(usage.totals.inputTokens)} />
          <Stat label="Tokens out" value={compact(usage.totals.outputTokens)} />
        </div>
        <Sparkline days={usage.daily} />
      </section>

      {empty ? (
        <div style={cardStyle} className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <BarChart3 aria-hidden className="h-5 w-5" style={{ color: 'var(--text-3)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            No managed usage in this window
          </p>
          <p className="max-w-sm text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
            Only AGI-managed cloud turns are metered here. Work members run locally or on your own
            provider keys never reaches our infrastructure, so there is nothing for us to meter.
          </p>
        </div>
      ) : (
        <>
          <BreakdownTable
            title="By member"
            caption="Who is spending. Volume and cost only — this surface never carries what anyone asked the model."
            rows={usage.byMember}
          />
          <BreakdownTable
            title="By model"
            caption="Where the spend is going, which is usually the fastest lever on a workspace bill."
            rows={usage.byModel}
          />
          <BreakdownTable
            title="By provider"
            caption="Grouped by upstream provider."
            rows={usage.byProvider}
          />
        </>
      )}

      <p className="px-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        There is no spend limit or hard cap yet. This reports what a workspace consumed; it does not
        stop it consuming more.
      </p>
    </div>
  );
}
