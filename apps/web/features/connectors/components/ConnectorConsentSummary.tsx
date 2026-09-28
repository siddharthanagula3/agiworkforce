'use client';

import { ShieldAlert } from 'lucide-react';

const POINTS: { title: string; body: string }[] = [
  {
    title: 'Tools AGI does not recognise ask before they act',
    body: 'A connector tool AGI does not recognise waits for your approval on every call until you set it to Allow. A tool AGI knows only reads data, such as a pull-request diff, follows your Tool approvals default, which runs it without asking unless you change it.',
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
    title: 'What it fetches stays with the chat',
    body: 'Anything a connector returns is kept as part of the chat it was used in and follows that chat’s retention, so deleting the chat deletes it. Disconnecting stops new fetches but does not remove what past chats already hold.',
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
        className ?? 'rounded-xl border border-warning-fill/20 bg-warning-fill/5 p-3.5 text-start'
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
        <span className="text-xs font-semibold text-warning-text">Before you connect</span>
      </div>
      <ul className="space-y-1.5">
        {POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-fill/50" />
            <span>
              <span className="font-medium text-foreground">{point.title}.</span> {point.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-muted-foreground">
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
