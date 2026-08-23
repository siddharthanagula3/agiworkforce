import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { getEffectiveOrganizationPolicy } from '@/lib/services/organization-policy-service';

/**
 * Whether a signal's value actually binds at runtime.
 *
 * The distinction is the whole point of this surface. A buyer's security team
 * reads a posture dashboard as a list of controls, so a row that is merely
 * recorded must not sit next to a row that denies requests wearing the same
 * styling. `retentionDays`, for instance, is stored and swept by nothing
 * (ORGPOLICY-03), and per-surface sync resolves from a client-supplied header
 * (ORGPOLICY-02) — both are positions this workspace has taken, not boundaries
 * an attacker meets.
 */
export type PostureEnforcement = 'enforced' | 'stated' | 'unconfigured';

export type PostureState = 'ok' | 'attention' | 'off';

export interface PostureSignal {
  id: string;
  label: string;
  value: string;
  state: PostureState;
  enforcement: PostureEnforcement;
  detail: string;
  href?: string;
}

export interface PostureGroup {
  id: string;
  title: string;
  signals: PostureSignal[];
}

export interface WorkspacePosture {
  organizationId: string;
  organizationName: string | null;
  generatedAt: string;
  groups: PostureGroup[];
  recommendations: PostureRecommendation[];
}

export interface PostureRecommendation {
  id: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}

interface OrgRow {
  name: string | null;
  licensed_seats: number | null;
  seats_consumed: number | null;
}

interface CountRow {
  count: string | number | null;
}

interface ModelPolicyCountsRow {
  allowed_providers: number;
  blocked_providers: number;
  allowed_models: number;
  blocked_models: number;
}

interface RoleCountRow {
  role: string;
  count: string | number | null;
}

interface SsoRow {
  domain: string;
  provider_type: string;
  is_active: boolean;
  domain_verified_at: string | Date | null;
  clerk_connection_id: string | null;
}

interface DirectoryRow {
  provider: string;
  is_active: boolean;
  last_sync_at: string | Date | null;
}

function toCount(row: CountRow | undefined): number {
  if (!row) return 0;
  const raw = row.count;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return Number.parseInt(raw, 10) || 0;
  return 0;
}

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Reads what is actually true of one workspace, from the tables that hold it.
 *
 * Every query is bound to `organizationId`. Callers must have already proven the
 * caller's membership and admin role — this function does not re-authorize, and
 * is only ever reached through a route that does.
 */
export async function readWorkspacePosture(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<WorkspacePosture> {
  const [
    orgRows,
    roleRows,
    invitationRows,
    ssoRows,
    directoryRows,
    scimTokenRows,
    scimUserRows,
    scimGroupRows,
    syncErrorRows,
    sharedProjectRows,
    sharedConnectorRows,
    auditRows,
    holdRows,
    modelPolicyRows,
    policy,
  ] = await Promise.all([
    db.query<OrgRow>(
      'select name, licensed_seats, seats_consumed from public.organizations where id = $1 limit 1',
      [organizationId],
    ),
    db.query<RoleCountRow>(
      `select role, count(*)::int as count
         from public.organization_members
        where organization_id = $1
        group by role`,
      [organizationId],
    ),
    db.query<CountRow>(
      `select count(*)::int as count
         from public.organization_invitations
        where organization_id = $1 and status = 'pending' and expires_at > now()`,
      [organizationId],
    ),
    db.query<SsoRow>(
      `select domain, provider_type, is_active, domain_verified_at, clerk_connection_id
         from public.sso_connections
        where organization_id = $1
        order by created_at desc`,
      [organizationId],
    ),
    db.query<DirectoryRow>(
      `select provider, is_active, last_sync_at
         from public.directory_sync_connections
        where organization_id = $1
        order by created_at desc`,
      [organizationId],
    ),
    db.query<CountRow>(
      `select count(*)::int as count
         from public.scim_tokens
        where organization_id = $1
          and revoked_at is null
          and (expires_at is null or expires_at > now())`,
      [organizationId],
    ),
    db.query<CountRow>(
      `select count(*)::int as count
         from public.scim_provisioned_users
        where organization_id = $1 and active = true`,
      [organizationId],
    ),
    db.query<CountRow>(
      'select count(*)::int as count from public.scim_groups where organization_id = $1',
      [organizationId],
    ),
    db.query<CountRow>(
      `select count(*)::int as count
         from public.directory_sync_events
        where organization_id = $1
          and error is not null
          and created_at > now() - interval '7 days'`,
      [organizationId],
    ),
    db.query<CountRow>(
      'select count(*)::int as count from public.organization_shared_projects where organization_id = $1',
      [organizationId],
    ),
    db.query<CountRow>(
      'select count(*)::int as count from public.organization_shared_connectors where organization_id = $1',
      [organizationId],
    ),
    db.query<CountRow>(
      `select count(*)::int as count
         from public.enterprise_audit_events
        where organization_id = $1 and created_at > now() - interval '30 days'`,
      [organizationId],
    ),
    db.query<CountRow>(
      `select count(*)::int as count
         from public.legal_holds
        where organization_id = $1 and released_at is null`,
      [organizationId],
    ),
    db.query<ModelPolicyCountsRow>(
      `select cardinality(allowed_providers) as allowed_providers,
              cardinality(blocked_providers) as blocked_providers,
              cardinality(allowed_models) as allowed_models,
              cardinality(blocked_models) as blocked_models
         from public.organization_model_policies
        where organization_id = $1
        limit 1`,
      [organizationId],
    ),
    getEffectiveOrganizationPolicy(db, organizationId),
  ]);

  const org = orgRows[0] ?? null;
  const memberCount = roleRows.reduce((sum, row) => sum + toCount(row), 0);
  const adminCount = roleRows
    .filter((row) => row.role === 'owner' || row.role === 'admin')
    .reduce((sum, row) => sum + toCount(row), 0);
  const pendingInvitations = toCount(invitationRows[0]);
  const licensedSeats = org?.licensed_seats ?? null;
  const seatsConsumed = org?.seats_consumed ?? null;

  const activeSso = ssoRows.filter((row) => row.is_active);
  const verifiedDomains = ssoRows.filter((row) => row.domain_verified_at !== null);
  const activeDirectory = directoryRows.filter((row) => row.is_active);
  const scimTokens = toCount(scimTokenRows[0]);
  const syncErrors = toCount(syncErrorRows[0]);
  const lastSync = activeDirectory
    .map((row) => toIsoOrNull(row.last_sync_at))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);

  const sharedProjects = toCount(sharedProjectRows[0]);
  const sharedConnectors = toCount(sharedConnectorRows[0]);
  const auditEvents = toCount(auditRows[0]);
  const activeHolds = toCount(holdRows[0]);
  const modelPolicy = modelPolicyRows[0] ?? null;
  const modelRules = modelPolicy
    ? modelPolicy.allowed_providers +
      modelPolicy.blocked_providers +
      modelPolicy.allowed_models +
      modelPolicy.blocked_models
    : 0;
  const { configured, policy: effectivePolicy } = policy;

  const groups: PostureGroup[] = [
    {
      id: 'identity',
      title: 'Identity',
      signals: [
        {
          id: 'sso',
          label: 'Single sign-on',
          value:
            activeSso.length > 0
              ? `${plural(activeSso.length, 'connection', 'connections')} active`
              : ssoRows.length > 0
                ? `${plural(ssoRows.length, 'connection', 'connections')} configured, none active`
                : 'Not configured',
          state: activeSso.length > 0 ? 'ok' : ssoRows.length > 0 ? 'attention' : 'off',
          enforcement: activeSso.length > 0 ? 'enforced' : 'unconfigured',
          detail:
            activeSso.length > 0
              ? `${activeSso.map((row) => `${row.domain} (${row.provider_type.toUpperCase()})`).join(', ')}. A connection only activates after its domain is verified and the IdP is provisioned.`
              : 'Members authenticate with whatever method their account allows. Connect your identity provider to centralise authentication.',
          href: '/workspace/identity',
        },
        {
          id: 'sso-required',
          label: 'SSO required',
          value: 'Not available',
          state: 'off',
          enforcement: 'unconfigured',
          detail:
            'Organization-level SSO enforcement is not built. Even with an active connection, a member who has a password can still use it. Do not represent this workspace as SSO-only.',
          href: '/workspace/identity',
        },
        {
          id: 'domains',
          label: 'Verified domains',
          value:
            verifiedDomains.length > 0
              ? verifiedDomains.map((row) => row.domain).join(', ')
              : 'None',
          state: verifiedDomains.length > 0 ? 'ok' : 'off',
          enforcement: verifiedDomains.length > 0 ? 'enforced' : 'unconfigured',
          detail:
            verifiedDomains.length > 0
              ? 'Verified by DNS TXT record. A connection cannot activate on an unverified domain.'
              : 'Verify a domain you own before an SSO connection can be activated on it.',
          href: '/workspace/identity',
        },
      ],
    },
    {
      id: 'provisioning',
      title: 'Provisioning',
      signals: [
        {
          id: 'scim',
          label: 'SCIM directory sync',
          value:
            activeDirectory.length > 0
              ? `${activeDirectory.map((row) => row.provider.replace(/_/g, ' ')).join(', ')}`
              : 'Not configured',
          state: activeDirectory.length > 0 ? 'ok' : 'off',
          enforcement: activeDirectory.length > 0 ? 'enforced' : 'unconfigured',
          detail:
            activeDirectory.length > 0
              ? `${plural(scimTokens, 'active token', 'active tokens')}. Last sync ${lastSync ? new Date(lastSync).toUTCString() : 'never recorded'}.`
              : 'Connect your directory so joiners and leavers are provisioned by your IdP rather than by hand.',
          href: '/workspace/identity',
        },
        {
          id: 'scim-errors',
          label: 'Sync errors (7 days)',
          value: syncErrors === 0 ? 'None' : String(syncErrors),
          state: syncErrors === 0 ? 'ok' : 'attention',
          enforcement: 'enforced',
          detail:
            syncErrors === 0
              ? 'No directory sync event recorded an error in the last seven days.'
              : 'Directory events failed to process. Each failure means the IdP and this workspace disagree about who has access.',
          href: '/workspace/identity',
        },
        {
          id: 'scim-population',
          label: 'Provisioned identities',
          value: `${plural(toCount(scimUserRows[0]), 'user', 'users')}, ${plural(toCount(scimGroupRows[0]), 'group', 'groups')}`,
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'Directory groups currently map to an organization role. They do not yet carry sharing grants, policy scope, or budgets.',
          href: '/workspace/identity',
        },
        {
          id: 'deprovision',
          label: 'Deprovision revokes credentials',
          value: 'Enforced',
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'Removing a member — by hand or from your IdP — revokes their live sessions, device refresh tokens, and API keys, not just their membership row. Anything that could not be reached is recorded on the event rather than swallowed. Their personal account survives; only its credentials are cut.',
          href: '/workspace/people',
        },
      ],
    },
    {
      id: 'access',
      title: 'Access',
      signals: [
        {
          id: 'members',
          label: 'Members',
          value: plural(memberCount, 'member', 'members'),
          state: 'ok',
          enforcement: 'enforced',
          detail: `${plural(adminCount, 'owner or admin', 'owners and admins')}. Membership is enforced in the database, not only in the application.`,
          href: '/workspace/people',
        },
        {
          id: 'invitations',
          label: 'Pending invitations',
          value: pendingInvitations === 0 ? 'None' : String(pendingInvitations),
          state: pendingInvitations === 0 ? 'ok' : 'attention',
          enforcement: 'enforced',
          detail:
            'Invitation tokens are hashed and expire. There is no transactional email provider configured, so invitations are delivered as a copyable link.',
          href: '/workspace/people',
        },
        {
          id: 'seats',
          label: 'Seats',
          value:
            licensedSeats === null
              ? 'Not provisioned'
              : `${seatsConsumed ?? 0} of ${licensedSeats} used`,
          state:
            licensedSeats !== null && (seatsConsumed ?? 0) >= licensedSeats ? 'attention' : 'ok',
          enforcement: licensedSeats === null ? 'unconfigured' : 'enforced',
          detail:
            'Seat count is written only by the billing webhook and cannot be lowered below occupied seats.',
          href: '/workspace/people',
        },
      ],
    },
    {
      id: 'ai-controls',
      title: 'AI controls',
      signals: [
        {
          id: 'policy-configured',
          label: 'Workspace policy',
          value: configured ? 'Saved' : 'Using shipped default',
          state: configured ? 'ok' : 'attention',
          enforcement: configured ? 'enforced' : 'unconfigured',
          detail: configured
            ? 'This workspace has its own saved policy row. It is read on every managed-compute request.'
            : 'No policy row exists for this workspace. Requests fall through to the shipped default until an owner or admin saves one.',
          href: '/workspace/policy',
        },
        {
          id: 'managed-compute',
          label: 'Managed cloud compute',
          value: effectivePolicy.allowManagedCompute ? 'Allowed' : 'Blocked',
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'Checked on all seven managed-compute routes before a turn runs. A denial is written to the audit trail and holds regardless of which client sent the request.',
          href: '/workspace/policy',
        },
        {
          id: 'privacy-modes',
          label: 'Allowed privacy modes',
          value: effectivePolicy.allowedPrivacyModes.join(', '),
          state: 'ok',
          enforcement: 'enforced',
          detail: `Default is ${effectivePolicy.defaultPrivacyMode}. A mode outside this list is refused server-side, not merely hidden in the picker.`,
          href: '/workspace/policy',
        },
        {
          id: 'model-policy',
          label: 'Approved models',
          value:
            modelRules === 0
              ? 'All models available'
              : `${plural(modelRules, 'rule', 'rules')} in force`,
          state: 'ok',
          enforcement: modelRules === 0 ? 'unconfigured' : 'enforced',
          detail:
            modelRules === 0
              ? 'No model or provider restriction is saved, so members may use any model in the catalog. A saved row with empty lists would also mean unrestricted — restriction is something an administrator states.'
              : 'Checked server-side after auto-routing resolves, so a blocked model cannot be reached by asking for Auto. A named model outranks a blocked provider, which is how "no Provider X except this one model" is expressed.',
          href: '/workspace/models',
        },
        {
          id: 'sync-surfaces',
          label: 'Chat sync surfaces',
          value: effectivePolicy.chatSyncSurfaces.join(', '),
          state: 'ok',
          enforcement: 'stated',
          detail:
            'Resolved from a client-supplied surface hint, so this governs the clients your organization deploys — it is not a boundary an attacker meets. Managed compute and privacy modes are the controls that bind regardless of client.',
          href: '/workspace/policy',
        },
      ],
    },
    {
      id: 'data',
      title: 'Data',
      signals: [
        {
          id: 'sharing',
          label: 'Workspace sharing',
          value: `${plural(sharedProjects, 'project', 'projects')}, ${plural(sharedConnectors, 'connector', 'connectors')}`,
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'Sharing is granted per resource with an explicit read or write level, enforced by row-level security rather than by a flag on the content row.',
          href: '/workspace/sharing',
        },
        {
          id: 'external-sharing',
          label: 'Public sharing',
          value: effectivePolicy.externalSharingEnabled ? 'Allowed' : 'Blocked',
          state: 'ok',
          enforcement: 'enforced',
          detail: effectivePolicy.externalSharingEnabled
            ? 'Members may publish a chat or an artifact to an anonymous public link. Both paths check this before minting one.'
            : 'New public links are refused on both the chat-share and artifact-publish paths. Links already published stay reachable — revoking those is a separate action.',
          href: '/workspace/policy',
        },
        {
          id: 'retention',
          label: 'Retention',
          value: effectivePolicy.retentionEnforced
            ? `${effectivePolicy.retentionDays} days, enforced`
            : `${effectivePolicy.retentionDays} days, not enforced`,
          state: effectivePolicy.retentionEnforced ? 'ok' : 'attention',
          enforcement: effectivePolicy.retentionEnforced ? 'enforced' : 'stated',
          detail: effectivePolicy.retentionEnforced
            ? `A nightly sweep permanently deletes workspace conversations with no activity for ${effectivePolicy.retentionDays} days. Records under legal hold are withheld, and every sweep is written to an evidence trail an admin can read.`
            : 'The window is recorded as this workspace’s position and nothing is deleted. Treat it as a stated policy, not as deletion you can evidence to an auditor, until an owner turns enforcement on.',
          href: '/workspace/policy',
        },
        {
          id: 'legal-hold',
          label: 'Legal hold',
          value:
            activeHolds === 0 ? 'None active' : `${plural(activeHolds, 'hold', 'holds')} active`,
          state: activeHolds === 0 ? 'ok' : 'attention',
          enforcement: 'enforced',
          detail:
            activeHolds === 0
              ? 'No custodian is currently held. A hold suspends retention for its subject, and the retention sweep refuses to delete anything at all if the hold set cannot be read.'
              : 'Retention is suspended for the held subjects. Their conversations survive the sweep regardless of age.',
          href: '/workspace/data',
        },
      ],
    },
    {
      id: 'audit',
      title: 'Audit',
      signals: [
        {
          id: 'usage',
          label: 'Usage and spend',
          value: 'Readable by owners and admins',
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'Managed cloud spend by member, model, and provider. Volume and cost only — this surface never carries what anyone asked the model. There is no spend limit or hard cap yet: it reports consumption, it does not stop it.',
          href: '/workspace/usage',
        },
        {
          id: 'audit-trail',
          label: 'Audit events (30 days)',
          value: auditEvents === 0 ? 'None recorded' : String(auditEvents),
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'Written through a security-definer function; direct INSERT is revoked from the application role, so an admin cannot rewrite history.',
          href: '/workspace/audit',
        },
        {
          id: 'audit-export',
          label: 'Audit export',
          value: effectivePolicy.auditExportEnabled ? 'Allowed' : 'Blocked',
          state: 'ok',
          enforcement: 'enforced',
          detail: effectivePolicy.auditExportEnabled
            ? 'Owners and admins can stream the trail as JSONL. Every export, and every refusal, is itself recorded.'
            : 'Export is refused for this workspace, and the refusal is recorded in the trail.',
          href: '/workspace/audit',
        },
        {
          id: 'siem',
          label: 'SIEM streaming',
          value: 'Not available',
          state: 'off',
          enforcement: 'unconfigured',
          detail:
            'There is no webhook or log drain. Pull the JSONL export on a schedule if your SIEM needs these events.',
          href: '/workspace/audit',
        },
      ],
    },
  ];

  return {
    organizationId,
    organizationName: org?.name ?? null,
    generatedAt: new Date().toISOString(),
    groups,
    recommendations: buildRecommendations({
      configured,
      activeSsoCount: activeSso.length,
      activeDirectoryCount: activeDirectory.length,
      verifiedDomainCount: verifiedDomains.length,
      syncErrors,
    }),
  };
}

/**
 * Only things this workspace can actually act on today. A recommendation that
 * points at a capability the tree does not have would be manufactured urgency.
 */
function buildRecommendations(input: {
  configured: boolean;
  activeSsoCount: number;
  activeDirectoryCount: number;
  verifiedDomainCount: number;
  syncErrors: number;
}): PostureRecommendation[] {
  const out: PostureRecommendation[] = [];

  if (!input.configured) {
    out.push({
      id: 'save-policy',
      title: 'Save a workspace policy',
      body: 'Until an owner saves one, this workspace inherits the shipped default. Saving makes the decision yours and records it in the audit trail.',
      href: '/workspace/policy',
      cta: 'Review policy',
    });
  }

  if (input.verifiedDomainCount === 0) {
    out.push({
      id: 'verify-domain',
      title: 'Verify a company domain',
      body: 'Domain verification is the prerequisite for activating an SSO connection. It is a single DNS TXT record.',
      href: '/workspace/identity',
      cta: 'Verify domain',
    });
  }

  if (input.activeSsoCount === 0) {
    out.push({
      id: 'configure-sso',
      title: 'Connect your identity provider',
      body: 'SAML 2.0 and OIDC are supported. Centralising authentication is usually the first thing a security review asks for.',
      href: '/workspace/identity',
      cta: 'Configure SSO',
    });
  }

  if (input.activeDirectoryCount === 0) {
    out.push({
      id: 'configure-scim',
      title: 'Set up SCIM provisioning',
      body: 'Without it, removing someone from your directory does not remove their access here — an offboarding gap auditors look for.',
      href: '/workspace/identity',
      cta: 'Set up SCIM',
    });
  }

  if (input.syncErrors > 0) {
    out.push({
      id: 'sync-errors',
      title: 'Resolve directory sync errors',
      body: 'Failed sync events mean your IdP and this workspace disagree about who has access. Review the event log and retry.',
      href: '/workspace/identity',
      cta: 'View sync log',
    });
  }

  return out;
}
