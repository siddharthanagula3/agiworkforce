import {
  Activity,
  BadgeDollarSign,
  CircleAlert,
  DatabaseZap,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  MANAGED_COMPUTE_MARGIN_POLICY,
} from '@agiworkforce/types';
import {
  isManagedComputePrivateBetaEnabled,
  MANAGED_COMPUTE_PRIVATE_BETA_ENV,
} from '@/lib/managed-compute-gate';
import SecurityOperationsPanel from '../components/SecurityOperationsPanel';

// Managed compute has been public alpha (open by default) since 2026-06-27.
// AGI_MANAGED_COMPUTE_PRIVATE_BETA is an incident-response kill-switch only
// (0/false/off re-gates); every status element below reads the same live
// signal so this page cannot drift into the retired "launch gate"/"private
// beta"/"waitlisted" framing again.
function managedComputeStatusLabel(open: boolean): string {
  return open ? 'Public alpha' : 'Temporarily disabled (incident kill-switch)';
}

function buildReadinessRows(managedComputeOpen: boolean) {
  return [
    {
      area: 'Privacy modes',
      status: 'Fail-closed',
      owner: 'Platform',
      evidence: `${DEFAULT_ENTERPRISE_ADMIN_POLICY.allowedPrivacyModes.join(', ')} allowed by default`,
    },
    {
      area: 'Managed compute',
      status: managedComputeStatusLabel(managedComputeOpen),
      owner: 'Billing',
      evidence: managedComputeOpen
        ? `Open by default since 2026-06-27. Hard review at ${MANAGED_COMPUTE_MARGIN_POLICY.hardStopAtRevenueShare * 100}% provider-cost share.`
        : `${MANAGED_COMPUTE_PRIVATE_BETA_ENV} is engaged as an incident-response kill-switch.`,
    },
    {
      area: 'Identity',
      status: 'Implemented — entitlement-gated',
      owner: 'Enterprise',
      evidence:
        'Migration 0076 owns SSO and directory-sync configuration with RLS. First-party SSO sign-in (lib/server/sso/clerk-enterprise-connections.ts, /api/admin/sso) and SCIM provisioning (/api/scim/v2) are implemented and gated on the enterprise_controls capability by lib/server/sso/sso-route-guard.ts, which is a capability check rather than a tier comparison',
    },
    {
      area: 'Audit logs',
      status: 'Append-only',
      owner: 'Security',
      evidence: 'Enterprise audit events and export requests are separated from support logs',
    },
    {
      area: 'Support loop',
      status: 'Routed',
      owner: 'Support',
      evidence: 'Support cases, feedback cases, and release fix links have shared tables',
    },
  ];
}

function buildPolicyTiles(managedComputeOpen: boolean) {
  return [
    {
      icon: LockKeyhole,
      label: 'Default Privacy',
      value: DEFAULT_ENTERPRISE_ADMIN_POLICY.defaultPrivacyMode.toUpperCase(),
      detail: 'Local and BYOK are public-safe. Managed mode requires admin and commercial gates.',
    },
    {
      icon: ShieldCheck,
      label: 'Chat Sync',
      value: DEFAULT_ENTERPRISE_ADMIN_POLICY.chatSyncSurfaces.join(' / '),
      detail: 'Normal synced chat is intentionally limited to Web, Desktop, and Mobile.',
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
    <div className="min-h-screen bg-[#0b0d0f] text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase text-emerald-300">Enterprise control plane</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">
              Admin readiness
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Operational surface for teams, policy, identity, auditability, support, and
              managed-compute commercial gates.
            </p>
          </div>
          <div
            className={
              managedComputeOpen
                ? 'flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100'
                : 'flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100'
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
              <div
                key={tile.label}
                className="rounded-md border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-400">{tile.label}</span>
                  <Icon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                </div>
                <div className="mt-3 font-mono text-xl text-white">{tile.value}</div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">{tile.detail}</p>
              </div>
            );
          })}
        </section>

        <SecurityOperationsPanel />

        <section className="overflow-hidden rounded-md border border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <DatabaseZap className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <h2 className="text-sm font-medium text-white">Enterprise readiness ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {readinessRows.map((row) => (
                  <tr key={row.area} className="border-t border-white/10">
                    <td className="px-4 py-3 text-white">{row.area}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-100">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{row.owner}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
            <KeyRound className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <h2 className="mt-4 text-base font-medium text-white">Identity</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Organization, SSO, and directory-sync configuration now have canonical migrations and
              RLS. First-party SSO sign-in and SCIM provisioning remain intentionally deferred.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <h2 className="mt-4 text-base font-medium text-white">Policy</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Admin, provider, connector, and retention policies are separate so agents can own
              future work without editing the same file.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
            <LifeBuoy className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <h2 className="mt-4 text-base font-medium text-white">Feedback</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Support and feedback cases can link to fixes and releases, which is the base for
              future customer-feedback-to-PR automation.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
