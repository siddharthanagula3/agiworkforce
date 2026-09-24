'use client';

import { useMemo, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import {
  auditQueryToParams,
  useWorkspaceAudit,
  type AuditEventView,
  type AuditQuery,
} from '../hooks/use-settings-queries';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  overflow: 'hidden',
} as const;

const headerStyle = {
  padding: 'var(--space-4) var(--space-5)',
  borderBottom: '1px solid var(--settings-border)',
} as const;

const controlStyle = {
  minHeight: 30,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 12,
  padding: 'var(--space-1) var(--space-2)',
} as const;

const OUTCOMES = ['', 'success', 'failure', 'denied'] as const;
const SEVERITIES = ['', 'info', 'warning', 'critical'] as const;

/**
 * Outcome carries the meaning an admin scans for, so it is encoded in form as
 * well as text, a denial has to be findable without reading every row.
 */
function OutcomeChip({ outcome }: { outcome: AuditEventView['outcome'] }) {
  const tone =
    outcome === 'success'
      ? { fg: 'var(--text-2)', bd: 'var(--settings-border)' }
      : outcome === 'denied'
        ? { fg: 'var(--settings-destructive-text)', bd: 'currentColor' }
        : { fg: 'var(--text-1)', bd: 'currentColor' };

  return (
    <span
      style={{
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: tone.fg,
        border: `1px solid ${tone.bd}`,
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-1) var(--space-2)',
        whiteSpace: 'nowrap',
      }}
    >
      {outcome}
    </span>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function WorkspaceAuditSection() {
  const [query, setQuery] = useState<AuditQuery>({});
  const result = useWorkspaceAudit(query);
  const data = result.data ?? null;

  const exportHref = useMemo(() => {
    const params = auditQueryToParams(query);
    const suffix = params.toString();
    return `/api/settings/organization/audit/export${suffix ? `?${suffix}` : ''}`;
  }, [query]);

  function set(patch: Partial<AuditQuery>) {
    setQuery((current) => ({ ...current, ...patch }));
  }

  if (result.isLoading) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 'var(--space-5)', fontSize: 13, color: 'var(--text-3)' }}>
          Loading the audit trail…
        </div>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section style={cardStyle}>
        <div style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-1)' }}>
            The audit trail could not be loaded.
          </div>
          <button
            type="button"
            style={{ ...controlStyle, cursor: 'pointer', justifySelf: 'start' }}
            onClick={() => void result.refetch()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  // 403, a personal account, or a member without admin. Not an error state.
  if (!data) return null;

  const events = data.events;
  const filtered = Object.values(query).some((v) => v);

  return (
    <section style={cardStyle}>
      <header
        style={{ ...headerStyle, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <ScrollText size={15} aria-hidden="true" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              Audit trail
            </h3>
          </div>
          <p style={{ margin: 'var(--space-2) 0 0', fontSize: 12, color: 'var(--text-3)' }}>
            Administrative and identity events for this workspace. Append-only, entries cannot be
            edited or removed, including by an owner. Exporting is itself recorded here.
          </p>
        </div>
        <a
          href={exportHref}
          download
          style={{
            ...controlStyle,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            flex: 'none',
          }}
        >
          <Download size={13} aria-hidden="true" />
          Export JSONL
        </a>
      </header>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-5)',
          borderBottom: '1px solid var(--settings-border)',
        }}
      >
        <select
          aria-label="Filter by action"
          value={query.action ?? ''}
          onChange={(e) => set({ action: e.target.value })}
          style={controlStyle}
        >
          <option value="">All actions</option>
          {(data.facets?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by outcome"
          value={query.outcome ?? ''}
          onChange={(e) => set({ outcome: e.target.value as AuditQuery['outcome'] })}
          style={controlStyle}
        >
          {OUTCOMES.map((o) => (
            <option key={o || 'all'} value={o}>
              {o === '' ? 'All outcomes' : o}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by severity"
          value={query.severity ?? ''}
          onChange={(e) => set({ severity: e.target.value as AuditQuery['severity'] })}
          style={controlStyle}
        >
          {SEVERITIES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s === '' ? 'All severities' : s}
            </option>
          ))}
        </select>

        {filtered ? (
          <button
            type="button"
            onClick={() => setQuery({})}
            style={{ ...controlStyle, cursor: 'pointer' }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {events.length === 0 ? (
        <div style={{ padding: 'var(--space-6) var(--space-5)', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-1)', marginBottom: 'var(--space-1)' }}>
            {filtered ? 'No events match these filters' : 'No events recorded yet'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {filtered
              ? 'Widen the range or clear the filters.'
              : 'Administrative actions, policy changes, membership, identity, appear here as they happen.'}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['When', 'Actor', 'Action', 'Resource', 'Surface', 'Outcome'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: 'var(--space-2) var(--space-5)',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-3)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--settings-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      color: 'var(--text-2)',
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--settings-border)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatWhen(event.createdAt)}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      color: 'var(--text-2)',
                      borderBottom: '1px solid var(--settings-border)',
                      maxWidth: 180,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={event.actorUserId ?? 'system'}
                  >
                    {event.actorUserId ?? 'system'}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      color: 'var(--text-1)',
                      borderBottom: '1px solid var(--settings-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {event.action}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      color: 'var(--text-2)',
                      borderBottom: '1px solid var(--settings-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {event.resourceType}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      color: 'var(--text-3)',
                      borderBottom: '1px solid var(--settings-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {event.surface}
                  </td>
                  <td
                    style={{
                      padding: 'var(--space-2) var(--space-5)',
                      borderBottom: '1px solid var(--settings-border)',
                    }}
                  >
                    <OutcomeChip outcome={event.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.nextCursor ? (
        <div
          style={{ padding: 'var(--space-3) var(--space-5)', fontSize: 12, color: 'var(--text-3)' }}
        >
          Showing the most recent {events.length}. Export for the full range.
        </div>
      ) : null}
    </section>
  );
}
