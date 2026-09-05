import {
  Activity,
  BadgeDollarSign,
  CircleAlert,
  DatabaseZap,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  MANAGED_COMPUTE_MARGIN_POLICY,
} from '@agiworkforce/types';
import {
  isManagedComputePrivateBetaEnabled,
  MANAGED_COMPUTE_PRIVATE_BETA_ENV,
} from '@/lib/managed-compute-gate';
import ContentReportQueuePanel from '../components/ContentReportQueuePanel';
import SecurityOperationsPanel from '../components/SecurityOperationsPanel';

function managedComputeStatusLabel(open: boolean): string {
  return open ? 'Public alpha' : 'Temporarily disabled (incident kill-switch)';
}

type ReadinessTone = 'ok' | 'warn';

const READINESS_TONE_CLASS: Record<ReadinessTone, string> = {
  ok: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100',
  warn: 'border-amber-600/30 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100',
};

interface ReadinessRow {
  area: string;
  status: string;
  tone: ReadinessTone;
  owner: string;
  evidence: string;
}

function buildReadinessRows(managedComputeOpen: boolean): ReadinessRow[] {
  return [
    {
      area: 'Privacy modes',
      status: 'Per-workspace policy',
      tone: 'ok',
      owner: 'Platform',
      evidence: `Each workspace sets its own in organization_admin_policies and is enforced server-side; a workspace with no saved policy is unrestricted. Shipped default on first save: ${DEFAULT_ENTERPRISE_ADMIN_POLICY.allowedPrivacyModes.join(', ')}.`,
    },
    {
      area: 'Managed compute',
      status: managedComputeStatusLabel(managedComputeOpen),
      tone: managedComputeOpen ? 'ok' : 'warn',
      owner: 'Billing',
      evidence: managedComputeOpen
        ? `Open by default since 2026-06-27. Hard review at ${MANAGED_COMPUTE_MARGIN_POLICY.hardStopAtRevenueShare * 100}% provider-cost share.`
        : `${MANAGED_COMPUTE_PRIVATE_BETA_ENV} is engaged as an incident-response kill-switch.`,
    },
  ];
}

const ADMIN_CONTROLS: ReadonlyArray<{
  name: string;
  href: string;
  service: string;
  detail: string;
  external: boolean;
}> = [
  {
    name: 'Security operations',
    href: '#security-operations-title',
    service: 'GET /api/admin/security',
    detail:
      'Event metrics, alert thresholds, recent events, and top source IPs for the last 24 hours.',
    external: false,
  },
  {
    name: 'Account controls',
    href: '#security-operations-title',
    service: 'POST /api/admin/security',
    detail:
      'Suspend, ban, and reactivate accounts. Admin-authenticated, CSRF-protected, and written to the security audit log.',
    external: false,
  },
  {
    name: 'Content report queue',
    href: '#content-report-queue-title',
    service: 'GET/POST /api/admin/content-reports',
    detail:
      'Reports flagged from web and mobile, oldest first, with a 24-hour review SLA. Claim, action, or dismiss with a recorded reviewer note.',
    external: false,
  },
  {
    name: 'Directory sync (SCIM 2.0)',
    href: '/admin/directory-sync',
    service: '/api/admin/directory-sync',
    detail:
      'Register directory connections, mint and revoke SCIM bearer tokens, and read the provisioning event log.',
    external: true,
  },
  {
    name: 'Enterprise SSO',
    href: '/settings/team',
    service: '/api/admin/sso',
    detail:
      'SAML and OIDC connections, DNS domain verification, and activation. Owner-only writes, gated on enterprise_controls.',
    external: true,
  },
];

function buildPolicyTiles(managedComputeOpen: boolean) {
  return [
    {
      icon: LockKeyhole,
      label: 'Default Privacy On First Save',
      value: DEFAULT_ENTERPRISE_ADMIN_POLICY.defaultPrivacyMode.toUpperCase(),
      detail:
        'Not a live setting. This is what a workspace gets the first time its owner saves a policy at /settings/team; each workspace then owns its own value, and one that has never saved is unrestricted.',
    },
    {
      icon: ShieldCheck,
      label: 'Chat Sync On First Save',
      value: DEFAULT_ENTERPRISE_ADMIN_POLICY.chatSyncSurfaces.join(' / '),
      detail:
        'Not a live setting. Normal synced chat starts limited to Web, Desktop, and Mobile; a workspace owner may widen or narrow it, and the choice is enforced server-side on every managed request.',
    },
    {
      icon: BadgeDollarSign,
      label: 'Managed Compute Access',
      value: managedComputeOpen ? 'Open (public alpha)' : 'Temporarily disabled',
      detail: managedComputeOpen
        ? `Open by default since 2026-06-27. ${MANAGED_COMPUTE_PRIVATE_BETA_ENV} is an incident-response kill-switch only.`
        : `${MANAGED_COMPUTE_PRIVATE_BETA_ENV} is engaged. Managed compute is temporarily disabled as an incident-response measure.`,
    },
    {
      icon: Activity,
      label: 'Margin Warning',
      value: `${MANAGED_COMPUTE_MARGIN_POLICY.warningAtRevenueShare * 100}%`,
      detail: 'Provider-cost share at or above this level requires a commercial review.',
    },
  ];
}

export default function AdminConsolePage() {
  const managedComputeOpen = isManagedComputePrivateBetaEnabled();
  const readinessRows = buildReadinessRows(managedComputeOpen);
  const policyTiles = buildPolicyTiles(managedComputeOpen);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase text-emerald-700 dark:text-emerald-300">
              Enterprise control plane
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-foreground">
              Admin readiness
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Operational surface for teams, policy, identity, auditability, support, and
              managed-compute commercial gates.
            </p>
          </div>
          <div
            className={
              managedComputeOpen
                ? 'flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100'
                : 'flex items-center gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100'
            }
          >
            {managedComputeOpen ? (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <CircleAlert className="h-4 w-4" aria-hidden="true" />
            )}
            {managedComputeOpen
              ? 'Managed compute: public alpha, open by default'
              : 'Managed compute temporarily disabled (incident kill-switch)'}
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          {policyTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div key={tile.label} className="rounded-md border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{tile.label}</span>
                  <Icon
                    className="h-4 w-4 text-emerald-600 dark:text-emerald-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-3 font-mono text-xl text-foreground">{tile.value}</div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{tile.detail}</p>
              </div>
            );
          })}
        </section>

        <section
          className="overflow-hidden rounded-md border border-border bg-card"
          aria-labelledby="admin-controls-title"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <SlidersHorizontal
              className="h-4 w-4 text-sky-600 dark:text-sky-300"
              aria-hidden="true"
            />
            <h2 id="admin-controls-title" className="text-sm font-medium text-foreground">
              Admin controls
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {ADMIN_CONTROLS.map((control) => (
              <li
                key={control.name}
                className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{control.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{control.detail}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{control.service}</p>
                </div>
                <a
                  href={control.href}
                  className="shrink-0 self-start rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground hover:bg-accent md:self-center"
                >
                  {control.external ? 'Open' : 'Jump to'}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <SecurityOperationsPanel />

        <ContentReportQueuePanel />

        <section
          className="overflow-hidden rounded-md border border-border bg-card"
          aria-labelledby="readiness-ledger-title"
        >
          <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <DatabaseZap
                className="h-4 w-4 text-emerald-600 dark:text-emerald-300"
                aria-hidden="true"
              />
              <h2 id="readiness-ledger-title" className="text-sm font-medium text-foreground">
                Live policy state
              </h2>
            </div>
            <p
              data-testid="readiness-ledger-disclaimer"
              className="text-xs leading-5 text-muted-foreground"
            >
              Not a live health check. Every row is read from this deployment&apos;s policy
              constants and environment on page load, so it says what this build is configured to
              do, not what any running system is currently doing. Rows that were a written
              self-attestation rather than a read were removed. Use the security operations panel
              above for live state.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {readinessRows.map((row) => (
                  <tr key={row.area} className="border-t border-border">
                    <td className="px-4 py-3 text-foreground">{row.area}</td>
                    <td className="px-4 py-3">
                      <span
                        data-tone={row.tone}
                        className={`inline-block whitespace-nowrap rounded-md border px-2 py-1 text-xs ${READINESS_TONE_CLASS[row.tone]}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{row.owner}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-card p-4">
            <KeyRound
              className="h-5 w-5 text-emerald-600 dark:text-emerald-300"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-base font-medium text-foreground">Identity</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Organization, SSO, and directory-sync configuration have canonical migrations and RLS.
              Enterprise SSO sign-in (Clerk enterprise connections, /api/admin/sso) and SCIM 2.0
              provisioning (/api/scim/v2) are implemented and gated on the enterprise_controls
              capability.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <ShieldCheck
              className="h-5 w-5 text-emerald-600 dark:text-emerald-300"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-base font-medium text-foreground">Policy</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Admin, provider, connector, and retention policies are separate so agents can own
              future work without editing the same file.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <LifeBuoy
              className="h-5 w-5 text-emerald-600 dark:text-emerald-300"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-base font-medium text-foreground">Feedback</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Support and feedback cases can link to fixes and releases, which is the base for
              future customer-feedback-to-PR automation.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
