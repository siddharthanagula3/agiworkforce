import type { ReactNode } from 'react';
import Link from 'next/link';
import { Building2, AlertTriangle, Lock } from 'lucide-react';

import { WorkspaceConsoleNav } from './WorkspaceConsoleNav';

export type ConsoleRole = 'owner' | 'admin' | 'member' | 'viewer';

const ADMIN_ROLES: ConsoleRole[] = ['owner', 'admin'];

function EmptyFrame({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-2)' }}
      >
        {icon}
      </div>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>
        {title}
      </h1>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
        {body}
      </p>
      {action}
    </main>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </Link>
  );
}

export function WorkspaceConsoleShell({
  role,
  organizationId,
  membershipUnavailable,
  children,
}: {
  role: ConsoleRole | null;
  organizationId: string | null;
  membershipUnavailable: boolean;
  children: ReactNode;
}) {
  if (membershipUnavailable) {
    return (
      <EmptyFrame
        icon={<AlertTriangle aria-hidden className="h-5 w-5" />}
        title="Workspace administration is temporarily unavailable"
        body="We could not read your workspace membership. This is a service fault on our side, not a change to your access. Try again in a moment."
        action={<PrimaryLink href="/workspace">Retry</PrimaryLink>}
      />
    );
  }

  if (!role || !organizationId) {
    return (
      <EmptyFrame
        icon={<Building2 aria-hidden className="h-5 w-5" />}
        title="No workspace selected"
        body="This console administers a shared workspace. You are currently in your personal account, which has no members, roles, or shared resources to administer. Switch to a workspace, or create one from Team settings."
        action={<PrimaryLink href="/settings/team">Go to Team settings</PrimaryLink>}
      />
    );
  }

  if (!ADMIN_ROLES.includes(role)) {
    return (
      <EmptyFrame
        icon={<Lock aria-hidden className="h-5 w-5" />}
        title="You do not administer this workspace"
        body={`Workspace administration is limited to owners and admins. Your role here is "${role}". An owner can change that from the Members page.`}
        action={<PrimaryLink href="/chat">Back to chat</PrimaryLink>}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 py-8 md:flex-row md:gap-10 md:px-6 md:py-10">
      <aside className="w-full shrink-0 md:w-60">
        <div className="mb-6">
          <p
            className="text-[10px] font-medium uppercase tracking-[0.14em]"
            style={{ color: 'var(--text-3)' }}
          >
            Administration
          </p>
          <h2 className="mt-1 text-base font-semibold" style={{ color: 'var(--text-1)' }}>
            Workspace
          </h2>
        </div>
        <WorkspaceConsoleNav />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
