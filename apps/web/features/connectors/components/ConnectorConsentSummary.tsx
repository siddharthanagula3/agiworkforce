'use client';

/**
 * ConnectorConsentSummary
 *
 * The short, plain-language disclosure shown wherever a user is about to grant
 * (or has granted) a connector access. Five lines, readable in under fifteen
 * seconds, linking out to /agent-permissions and /acceptable-use for the full
 * statement.
 *
 * WHY THIS EXISTS — it replaces `accessScopes()`, which generated its lines from
 * a connector's declared authType and described storage that does not exist:
 * "OAuth tokens stored securely in your account" was shown for every OAuth
 * connector, but POST /api/connectors returns 501 for every branded catalog
 * connector and `user_connectors` holds only connector_id + auth_type +
 * is_active — no tokens, no endpoints (see lib/user-connector-tools.ts header).
 *
 * EVERY LINE HERE MUST BE TRACEABLE. The matrix these are rendered against is
 * docs/legal/agent-authority-and-connector-scopes.md. If you change the tool
 * loop's approval gate, the connector surface, or a revocation path, update that
 * file and this component together.
 */

import { ShieldAlert } from 'lucide-react';

const POINTS: { title: string; body: string }[] = [
  {
    title: 'Connector tools ask before they act',
    body: 'When a connector tool is available in a conversation, every tool call in that turn waits for your approval — not once at connect time, every time.',
  },
  {
    title: 'A Block is absolute',
    body: 'Blocking a tool is enforced on the server before it runs. A modified client or a direct API call cannot get past it.',
  },
  {
    title: 'Connecting is not the same as granting scopes',
    body: 'Where a provider sign-in is involved, the provider’s own consent screen is what states the permissions being granted. Read it there.',
  },
  {
    title: 'Its tools see the context you send them',
    body: 'A connector receives the conversation content passed to its tools. Only connect services you would hand that content to.',
  },
  {
    title: 'You can disconnect at any time',
    body: 'Disconnecting removes the connection and deletes every saved per-tool permission for it, so a past “Always allow” does not survive.',
  },
];

export function ConnectorConsentSummary({ className }: { className?: string }) {
  return (
    <div
      className={
        className ?? 'rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-left'
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        <span className="text-xs font-semibold text-amber-400">Before you connect</span>
      </div>
      <ul className="space-y-1.5">
        {POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/50" />
            <span>
              <span className="font-medium text-foreground">{point.title}.</span> {point.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Full detail:{' '}
        <a href="/agent-permissions" className="underline hover:text-foreground">
          agent permissions
        </a>{' '}
        &middot;{' '}
        <a href="/acceptable-use" className="underline hover:text-foreground">
          acceptable use
        </a>
      </p>
    </div>
  );
}
