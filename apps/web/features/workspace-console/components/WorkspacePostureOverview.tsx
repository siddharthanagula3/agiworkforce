'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Check, Minus } from 'lucide-react';

import {
  useWorkspacePosture,
  type PostureEnforcement,
  type PostureSignal,
  type PostureState,
} from '../hooks/use-workspace-posture';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

function StateMark({ state }: { state: PostureState }) {
  const shared = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full';

  if (state === 'ok') {
    return (
      <span
        className={shared}
        style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}
        role="img"
        aria-label="Configured"
      >
        <Check aria-hidden className="h-3 w-3" />
      </span>
    );
  }

  if (state === 'attention') {
    return (
      <span
        className={shared}
        style={{ background: 'var(--bg-hover)', color: 'var(--settings-destructive-foreground)' }}
        role="img"
        aria-label="Needs attention"
      >
        <AlertTriangle aria-hidden className="h-3 w-3" />
      </span>
    );
  }

  return (
    <span
      className={shared}
      style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
      role="img"
      aria-label="Not configured"
    >
      <Minus aria-hidden className="h-3 w-3" />
    </span>
  );
}

/**
 * The load-bearing element of this page.
 *
 * A posture dashboard is read as a list of controls, so a value that is merely
 * recorded must never wear the same badge as one that denies requests. This
 * label is what stops the page from becoming the fake-checkbox surface a
 * security review is designed to catch.
 */
function EnforcementBadge({ enforcement }: { enforcement: PostureEnforcement }) {
  const copy: Record<PostureEnforcement, { text: string; title: string }> = {
    enforced: {
      text: 'Enforced',
      title:
        'A server-side check denies requests that violate this. It holds regardless of which client sends them.',
    },
    stated: {
      text: 'Stated position',
      title:
        'Recorded for this workspace, but nothing currently enforces it at runtime. Do not present this as a control to an auditor.',
    },
    unconfigured: {
      text: 'Not configured',
      title: 'Nothing is set, so nothing is enforced.',
    },
  };

  const { text, title } = copy[enforcement];

  return (
    <span
      title={title}
      className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
      style={{
        color:
          enforcement === 'stated' ? 'var(--settings-destructive-foreground)' : 'var(--text-3)',
        borderColor: enforcement === 'stated' ? 'currentColor' : 'var(--settings-border)',
      }}
    >
      {text}
    </span>
  );
}

function SignalRow({ signal }: { signal: PostureSignal }) {
  const body = (
    <>
      <StateMark state={signal.state} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            {signal.label}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-2)' }}>
            — {signal.value}
          </span>
          <EnforcementBadge enforcement={signal.enforcement} />
        </span>
        <span className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {signal.detail}
        </span>
      </span>
      {signal.href ? (
        <ArrowRight
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ color: 'var(--text-3)' }}
        />
      ) : null}
    </>
  );

  const rowClass =
    'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

  if (!signal.href) {
    return <div className={rowClass}>{body}</div>;
  }

  return (
    <Link href={signal.href} className={`${rowClass} hover:bg-[var(--bg-hover)]`}>
      {body}
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div style={cardStyle} className="animate-pulse">
      <div
        className="h-11 border-b"
        style={{ borderColor: 'var(--settings-border)', background: 'var(--bg-hover)' }}
      />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-1/3 rounded" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 w-2/3 rounded" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 w-1/2 rounded" style={{ background: 'var(--bg-hover)' }} />
      </div>
    </div>
  );
}

export function WorkspacePostureOverview() {
  const { data, isPending, isError, error, refetch } = useWorkspacePosture();

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError) {
    return (
      <div style={cardStyle} className="p-6">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
          We could not load your workspace posture
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (data === null) {
    return (
      <div style={cardStyle} className="p-6">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
          You do not administer this workspace
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
          The security posture is limited to owners and admins because it enumerates how this
          workspace authenticates, provisions, and shares. Ask an owner if you need it.
        </p>
      </div>
    );
  }

  const { posture } = data;
  const attentionCount = posture.groups
    .flatMap((group) => group.signals)
    .filter((signal) => signal.state === 'attention').length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>
          {posture.organizationName ?? 'Workspace'}
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
          Read live from this workspace&rsquo;s configuration on{' '}
          {new Date(posture.generatedAt).toLocaleString()}.{' '}
          {attentionCount > 0
            ? `${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} attention.`
            : 'Nothing is currently flagged.'}
        </p>
      </header>

      {posture.recommendations.length > 0 ? (
        <section style={cardStyle} aria-labelledby="recommendations-heading">
          <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
            <h2
              id="recommendations-heading"
              className="text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}
            >
              Recommended
            </h2>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
            {posture.recommendations.map((rec) => (
              <li
                key={rec.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: 'var(--settings-border)' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                    {rec.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                    {rec.body}
                  </p>
                </div>
                <Link
                  href={rec.href}
                  className="shrink-0 self-start rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
                  style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
                >
                  {rec.cta}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {posture.groups.map((group) => (
        <section key={group.id} style={cardStyle} aria-labelledby={`${group.id}-heading`}>
          <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
            <h2
              id={`${group.id}-heading`}
              className="text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}
            >
              {group.title}
            </h2>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
            {group.signals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        </section>
      ))}

      <p className="px-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
        &ldquo;Stated position&rdquo; means the value is recorded for this workspace but no runtime
        check reads it yet. It is shown so that what you can evidence to an auditor stays separable
        from what you have merely configured.
      </p>
    </div>
  );
}
