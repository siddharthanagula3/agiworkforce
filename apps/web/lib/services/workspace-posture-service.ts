import 'server-only';

import { X509Certificate } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  auditStreamContinuity,
  type AuditStreamContinuity,
} from '@/lib/services/audit-streaming-service';
import { getEffectiveOrganizationPolicy } from '@/lib/services/organization-policy-service';
import {
  readOrganizationKeyStatus,
  type OrganizationKeyStatus,
} from '@/lib/server/organization-encryption-keys';
import { readOrganizationRegion, type OrganizationRegionState } from '@/lib/server/data-region';
import { retentionEnforcement } from '@/lib/server/retention/enforcement';
import { resolveOrganizationEntitlementPlan } from '@/lib/services/org-entitlements';
import { DATA_REGIONS, DEFAULT_DATA_REGION } from '@agiworkforce/compliance';

/**
 * Whether a signal's value actually binds at runtime.
 *
 * The distinction is the whole point of this surface. A buyer's security team
 * reads a posture dashboard as a list of controls, so a row that is merely
 * recorded must not sit next to a row that denies requests wearing the same
 * styling. `retentionDays`, for instance, is stored and swept by nothing
 * (ORGPOLICY-03), and per-surface sync resolves from a client-supplied header
 * (ORGPOLICY-02), both are positions this workspace has taken, not boundaries
 * an attacker meets.
 */
export type PostureEnforcement = 'enforced' | 'stated' | 'unconfigured';

export type PostureState = 'ok' | 'attention' | 'off';

/**
 * A workspace with one owner is one lost account away from nobody being able to
 * change its billing, policy or membership. Support cannot promote an owner for
 * a workspace it has no member of, so this is recovered by nobody.
 */
export const MIN_RECOMMENDED_OWNERS = 2;

/**
 * How long before an identity provider's signing certificate expires the
 * workspace is told. An expired certificate does not degrade sign-in, it ends
 * it for every member at once, and reissuing one is an IdP-side change with its
 * own change window.
 */
export const CERTIFICATE_ATTENTION_DAYS = 30;

/**
 * A data key that has never been rotated is the one an auditor asks about, and
 * the answer "we can, nobody has" is only visible if the age is measured. The
 * window is the annual rotation the compliance frameworks this product is sold
 * against expect.
 */
export const KEY_ROTATION_ATTENTION_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

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

interface AuditDestinationRow {
  enabled: boolean;
  consecutive_failures: number;
  last_delivered_at: string | Date | null;
}

interface SpendLimitRow {
  monthly_cap_cents: number;
  enforcement: 'off' | 'notify' | 'block';
}

interface ConnectorPolicyCountsRow {
  allowed_connectors: number;
  blocked_connectors: number;
  allow_custom_connectors: boolean;
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
  metadata_xml: string | null;
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
 * caller's membership and admin role, this function does not re-authorize, and
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
    auditDestinationRows,
    spendLimitRows,
    connectorPolicyRows,
    modelPolicyRows,
    streamContinuity,
    policy,
    keyStatus,
    regionState,
    plan,
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
      `select domain, provider_type, is_active, domain_verified_at, clerk_connection_id, metadata_xml
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
    db.query<AuditDestinationRow>(
      `select enabled, consecutive_failures, last_delivered_at
         from public.organization_audit_destinations
        where organization_id = $1
        limit 1`,
      [organizationId],
    ),
    db.query<SpendLimitRow>(
      `select monthly_cap_cents, enforcement
         from public.organization_spend_limits
        where organization_id = $1
        limit 1`,
      [organizationId],
    ),
    db.query<ConnectorPolicyCountsRow>(
      `select cardinality(allowed_connectors) as allowed_connectors,
              cardinality(blocked_connectors) as blocked_connectors,
              allow_custom_connectors
         from public.organization_connector_policies
        where organization_id = $1
        limit 1`,
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
    auditStreamContinuity(db, new Date(), organizationId),
    getEffectiveOrganizationPolicy(db, organizationId),
    readOrganizationKeyStatus(db, organizationId),
    readOrganizationRegion(db, organizationId),
    resolveOrganizationEntitlementPlan(organizationId),
  ]);

  const org = orgRows[0] ?? null;
  const memberCount = roleRows.reduce((sum, row) => sum + toCount(row), 0);
  const ownerCount = roleRows
    .filter((row) => row.role === 'owner')
    .reduce((sum, row) => sum + toCount(row), 0);
  const adminCount = roleRows
    .filter((row) => row.role === 'admin')
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
  const auditDestination = auditDestinationRows[0] ?? null;
  const spendLimit = spendLimitRows[0] ?? null;
  const connectorPolicy = connectorPolicyRows[0] ?? null;
  const connectorRules = connectorPolicy
    ? connectorPolicy.allowed_connectors +
      connectorPolicy.blocked_connectors +
      (connectorPolicy.allow_custom_connectors ? 0 : 1)
    : 0;
  const modelPolicy = modelPolicyRows[0] ?? null;
  const modelRules = modelPolicy
    ? modelPolicy.allowed_providers +
      modelPolicy.blocked_providers +
      modelPolicy.allowed_models +
      modelPolicy.blocked_models
    : 0;
  const { configured, policy: effectivePolicy } = policy;
  const retention = retentionEnforcement({
    plan,
    retentionDays: effectivePolicy.retentionDays,
    retentionEnforced: effectivePolicy.retentionEnforced,
  });

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
        certificateSignal(activeSso),
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
            'Removing a member, by hand or from your IdP, revokes their live sessions, device refresh tokens, and API keys, not just their membership row. Anything that could not be reached is recorded on the event rather than swallowed. Their personal account survives; only its credentials are cut.',
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
          detail: `${plural(ownerCount, 'owner', 'owners')} and ${plural(adminCount, 'admin', 'admins')}. Only current workspace members receive workspace access.`,
          href: '/workspace/people',
        },
        ownersSignal(ownerCount),
        {
          id: 'invitations',
          label: 'Pending invitations',
          value: pendingInvitations === 0 ? 'None' : String(pendingInvitations),
          state: pendingInvitations === 0 ? 'ok' : 'attention',
          enforcement: 'enforced',
          detail:
            'Invitations use secure, expiring links that an owner or admin can copy and send.',
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
            'The licensed seat count follows the active subscription and cannot be set below the number already in use.',
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
            ? 'Workspace-specific rules are active for managed cloud work.'
            : 'This workspace is using the default rules. Review and save workspace rules to make its requirements explicit.',
          href: '/workspace/policy',
        },
        {
          id: 'managed-compute',
          label: 'Managed cloud compute',
          value: effectivePolicy.allowManagedCompute ? 'Allowed' : 'Blocked',
          state: 'ok',
          enforcement: 'enforced',
          detail:
            'This setting is applied before managed cloud work begins on every supported client. Blocked attempts appear in the audit trail.',
          href: '/workspace/policy',
        },
        {
          id: 'privacy-modes',
          label: 'Allowed privacy modes',
          value: effectivePolicy.allowedPrivacyModes.join(', '),
          state: 'ok',
          enforcement: 'enforced',
          detail: `Default is ${effectivePolicy.defaultPrivacyMode}. Members can use only the privacy modes listed here.`,
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
              ? 'No model or provider restriction is active, so members may use any model in the catalog.'
              : 'These rules also apply after Auto chooses a model. An explicitly allowed model can remain available when its provider is otherwise blocked.',
          href: '/workspace/models',
        },
        {
          id: 'connector-policy',
          label: 'Approved connectors',
          value:
            connectorRules === 0
              ? 'All connectors available'
              : `${plural(connectorRules, 'rule', 'rules')} in force`,
          state: 'ok',
          enforcement: connectorRules === 0 ? 'unconfigured' : 'enforced',
          detail:
            connectorRules === 0
              ? 'No connector restriction is saved, so members may use any integration. Custom connectors, arbitrary member-supplied MCP endpoints, are allowed too.'
              : 'Applied where the tool catalog is assembled, which is the one path chat, scheduled tasks, and cloud agent runs all share. A blocked connector is never offered to the model, so it cannot be called from any of them.',
          href: '/workspace/connectors',
        },
        {
          id: 'sync-surfaces',
          label: 'Chat sync surfaces',
          value: effectivePolicy.chatSyncSurfaces.join(', '),
          state: 'ok',
          enforcement: 'stated',
          detail:
            'Resolved from a client-supplied surface hint, so this governs the clients your organization deploys, it is not a boundary an attacker meets. Managed compute and privacy modes are the controls that bind regardless of client.',
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
            'Each shared resource has an explicit read or write level, limited to the workspace members who receive access.',
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
            : 'Members cannot create new public chat or artifact links. Existing links stay reachable until an owner revokes them.',
          href: '/workspace/policy',
        },
        {
          id: 'retention',
          label: 'Retention',
          value: retention.enforced
            ? `${effectivePolicy.retentionDays} days, enforced`
            : retention.required
              ? `${effectivePolicy.retentionDays} days, required by your plan and not yet enforced`
              : `${effectivePolicy.retentionDays} days, not enforced`,
          state: retention.enforced ? 'ok' : 'attention',
          enforcement: retention.enforced ? 'enforced' : 'stated',
          detail: retention.enforced
            ? `A nightly sweep permanently deletes workspace conversations with no activity for ${effectivePolicy.retentionDays} days. Records under legal hold are withheld, and every sweep is written to an evidence trail an admin can read.`
            : retention.required
              ? 'Your plan carries a retention commitment, so this window is not a preference. Nothing is deleted until an owner turns enforcement on, and until then the commitment is not one you could evidence to an auditor.'
              : 'The window is recorded as this workspace\u2019s position and nothing is deleted. Treat it as a stated policy, not as deletion you can evidence to an auditor, until an owner turns enforcement on.',
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
      id: 'residency-and-keys',
      title: 'Residency and keys',
      signals: [encryptionKeySignal(keyStatus), dataRegionSignal(regionState)],
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
            'Managed cloud spend by member, model, and provider. Volume and cost only, this surface never carries what anyone asked the model.',
          href: '/workspace/usage',
        },
        {
          id: 'spend-limit',
          label: 'Spend limit',
          value:
            spendLimit === null
              ? 'None'
              : spendLimit.enforcement === 'block'
                ? `$${(spendLimit.monthly_cap_cents / 100).toFixed(2)} a month, enforced`
                : `$${(spendLimit.monthly_cap_cents / 100).toFixed(2)} a month, ${spendLimit.enforcement}`,
          state: spendLimit === null ? 'attention' : 'ok',
          enforcement:
            spendLimit === null
              ? 'unconfigured'
              : spendLimit.enforcement === 'block'
                ? 'enforced'
                : 'stated',
          detail:
            spendLimit === null
              ? 'No monthly cap is set, so nothing stops this workspace spending. Usage is reported but not bounded.'
              : spendLimit.enforcement === 'block'
                ? 'Managed turns are refused once the calendar-month cap is reached. Enforcement is eventual rather than exact: the decision is cached briefly, so the workspace can overshoot by roughly a minute of spend.'
                : 'The cap is recorded and crossing it is reported, but no turn is refused. Switch enforcement to blocking if the budget is meant to bind.',
          href: '/workspace/usage',
        },
        {
          id: 'audit-trail',
          label: 'Audit events (30 days)',
          value: auditEvents === 0 ? 'None recorded' : String(auditEvents),
          state: 'ok',
          enforcement: 'enforced',
          detail: 'Workspace admins can read the audit history but cannot rewrite it.',
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
        siemSignal(auditDestination, streamContinuity[0] ?? null),
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
      ownerCount,
    }),
  };
}

const SIEM_DELIVERY_DETAIL =
  'Events are POSTed with an HMAC-SHA256 signature over the timestamp and body, drained on a ' +
  'schedule rather than written during the audited action, an unreachable endpoint must never ' +
  'stop the thing it records. A failed delivery holds the cursor, so events are retried rather ' +
  'than dropped.';

/**
 * A destination that answers nothing and a destination that answers 2xx and
 * files nothing look the same from the failure counter, so the backlog is read
 * too: it is the only signal that separates "delivering" from "silent".
 */
function siemSignal(
  destination: AuditDestinationRow | null,
  continuity: AuditStreamContinuity | null,
): PostureSignal {
  if (destination === null) {
    return {
      id: 'siem',
      label: 'SIEM streaming',
      value: 'Not configured',
      state: 'off',
      enforcement: 'unconfigured',
      detail:
        'No endpoint is configured. Pull the JSONL export on a schedule, or point us at an ' +
        'HTTPS endpoint and events will be delivered signed.',
      href: '/workspace/audit',
    };
  }

  if (!destination.enabled) {
    return {
      id: 'siem',
      label: 'SIEM streaming',
      value: 'Configured, paused',
      state: 'attention',
      enforcement: 'enforced',
      detail: SIEM_DELIVERY_DETAIL,
      href: '/workspace/audit',
    };
  }

  if (destination.consecutive_failures > 0) {
    return {
      id: 'siem',
      label: 'SIEM streaming',
      value: `Failing (${destination.consecutive_failures} in a row)`,
      state: 'attention',
      enforcement: 'enforced',
      detail: SIEM_DELIVERY_DETAIL,
      href: '/workspace/audit',
    };
  }

  if (continuity?.alerting) {
    return {
      id: 'siem',
      label: 'SIEM streaming',
      value: `Behind by ${plural(continuity.behindMinutes ?? 0, 'minute', 'minutes')}`,
      state: 'attention',
      enforcement: 'enforced',
      detail:
        `${plural(continuity.buffered, 'event', 'events')} are held and none has been ` +
        'accepted for longer than the alerting window. Nothing is lost: they are sent when ' +
        'your receiver reads again, and until then the copy in your SIEM is not current. ' +
        `${SIEM_DELIVERY_DETAIL}`,
      href: '/workspace/audit',
    };
  }

  return {
    id: 'siem',
    label: 'SIEM streaming',
    value: 'Delivering',
    state: 'ok',
    enforcement: 'enforced',
    detail: SIEM_DELIVERY_DETAIL,
    href: '/workspace/audit',
  };
}

function ownersSignal(ownerCount: number): PostureSignal {
  if (ownerCount === 0) {
    return {
      id: 'owners',
      label: 'Owners',
      value: 'None',
      state: 'attention',
      enforcement: 'enforced',
      detail:
        'No member holds the owner role, so nothing in this workspace can be transferred, ' +
        'rebilled or closed by anybody inside it. Promote an owner.',
      href: '/workspace/people',
    };
  }

  const healthy = ownerCount >= MIN_RECOMMENDED_OWNERS;
  return {
    id: 'owners',
    label: 'Owners',
    value: plural(ownerCount, 'owner', 'owners'),
    state: healthy ? 'ok' : 'attention',
    enforcement: 'enforced',
    detail: healthy
      ? 'More than one account can change billing, policy and membership, so losing one of ' +
        'them does not leave the workspace unadministered.'
      : 'One account holds every owner power. If it is lost, disabled by your identity ' +
        'provider, or leaves, nobody remaining can change billing, policy or membership, and ' +
        'no one outside the workspace can grant it back. Promote a second owner.',
    href: '/workspace/people',
  };
}

const X509_IN_METADATA = /<(?:[A-Za-z0-9_.-]+:)?X509Certificate>([\sA-Za-z0-9+/=]+?)<\//g;

/**
 * When the IdP's metadata was uploaded, its signing certificates are held here
 * and their expiry is a fact about this workspace rather than a setting. The
 * earliest one is what matters: sign-in ends on the first expiry, not the last.
 */
function earliestCertificateExpiry(metadataXml: string | null): Date | null {
  if (!metadataXml) return null;
  let earliest: Date | null = null;
  for (const match of metadataXml.matchAll(X509_IN_METADATA)) {
    const encoded = (match[1] ?? '').replace(/\s+/g, '');
    if (encoded.length === 0) continue;
    let validTo: Date;
    try {
      validTo = new Date(new X509Certificate(Buffer.from(encoded, 'base64')).validTo);
    } catch {
      continue;
    }
    if (!Number.isFinite(validTo.getTime())) continue;
    if (earliest === null || validTo < earliest) earliest = validTo;
  }
  return earliest;
}

function certificateSignal(activeSso: readonly SsoRow[]): PostureSignal {
  const saml = activeSso.filter((row) => row.provider_type === 'saml');
  if (saml.length === 0) {
    return {
      id: 'sso-certificate',
      label: 'Signing certificate',
      value: 'Not applicable',
      state: 'ok',
      enforcement: 'unconfigured',
      detail:
        'No SAML connection is active, so no identity provider certificate has to stay valid ' +
        'for members to sign in.',
      href: '/workspace/identity',
    };
  }

  const expiries = saml
    .map((row) => earliestCertificateExpiry(row.metadata_xml))
    .filter((value): value is Date => value !== null);

  if (expiries.length < saml.length) {
    return {
      id: 'sso-certificate',
      label: 'Signing certificate',
      value: 'Not verified',
      state: 'attention',
      enforcement: 'unconfigured',
      detail:
        'At least one active connection was set up from a metadata URL, so its signing ' +
        'certificate is not held here and its expiry cannot be checked from this page. Upload ' +
        'the metadata document instead, or track the expiry date with your identity provider: ' +
        'when it passes, every member stops being able to sign in at once.',
      href: '/workspace/identity',
    };
  }

  const earliest = expiries.reduce((a, b) => (a < b ? a : b));
  const daysLeft = Math.floor((earliest.getTime() - Date.now()) / DAY_MS);
  const on = earliest.toUTCString();

  if (daysLeft < 0) {
    return {
      id: 'sso-certificate',
      label: 'Signing certificate',
      value: `Expired ${on}`,
      state: 'attention',
      enforcement: 'enforced',
      detail:
        'The certificate that signs this connection’s assertions has expired. Sign-in ' +
        'through it fails for every member until your identity provider issues a new one and ' +
        'its metadata is uploaded here.',
      href: '/workspace/identity',
    };
  }

  return {
    id: 'sso-certificate',
    label: 'Signing certificate',
    value: daysLeft <= CERTIFICATE_ATTENTION_DAYS ? `Expires ${on}` : `Valid until ${on}`,
    state: daysLeft <= CERTIFICATE_ATTENTION_DAYS ? 'attention' : 'ok',
    enforcement: 'enforced',
    detail:
      daysLeft <= CERTIFICATE_ATTENTION_DAYS
        ? `${plural(daysLeft, 'day', 'days')} left. Rotating a certificate is a change your ` +
          'identity provider makes and you upload here; until that happens, the expiry ends ' +
          'sign-in for every member at once.'
        : 'Read from the metadata this workspace uploaded. It is checked on every read of this ' +
          'page, so an approaching expiry is flagged here before it stops sign-in.',
    href: '/workspace/identity',
  };
}

/**
 * The key row says which key opens this workspace's data and whether it can be
 * reached. `unavailable` is the one that matters: the product refuses rather
 * than falling back to the platform key, so an administrator has to be able to
 * see that refusal here rather than discover it as a failed request.
 */
function keyRotationAge(lastRotatedAt: string | null): number | null {
  if (lastRotatedAt === null) return null;
  const rotatedAt = new Date(lastRotatedAt);
  if (!Number.isFinite(rotatedAt.getTime())) return null;
  return Math.floor((Date.now() - rotatedAt.getTime()) / DAY_MS);
}

function encryptionKeySignal(keyStatus: OrganizationKeyStatus): PostureSignal {
  const { availability } = keyStatus;
  const rotated = keyStatus.lastRotatedAt
    ? ` Last rotated ${new Date(keyStatus.lastRotatedAt).toUTCString()}.`
    : '';
  const rotationAge = keyRotationAge(keyStatus.lastRotatedAt);
  const stale = rotationAge === null || rotationAge > KEY_ROTATION_ATTENTION_DAYS;
  const staleness =
    rotationAge === null
      ? ' This key has never been rotated, so its age is the age of the workspace. Rotate it ' +
        'in your KMS and reactivate to start the clock.'
      : rotationAge > KEY_ROTATION_ATTENTION_DAYS
        ? ` It was last rotated ${plural(rotationAge, 'day', 'days')} ago, past the ` +
          `${KEY_ROTATION_ATTENTION_DAYS}-day window an annual rotation commitment implies.`
        : '';

  if (availability.state === 'platform_unconfigured') {
    return {
      id: 'encryption-key',
      label: 'Encryption key',
      value: 'Not configured',
      state: 'off',
      enforcement: 'unconfigured',
      detail:
        'No platform key ring is configured for this deployment, so nothing that needs one can ' +
        'be sealed or opened for this workspace. This is a deployment fault, not a workspace ' +
        'setting.',
      href: '/workspace/data',
    };
  }

  if (availability.state === 'platform_derived') {
    return {
      id: 'encryption-key',
      label: 'Encryption key',
      value: 'Platform key, derived per workspace',
      state: 'ok',
      enforcement: 'enforced',
      detail:
        'Secrets for this workspace are sealed under a key derived from the platform root for ' +
        'this workspace alone, so one workspace’s ciphertext does not open under another’s. ' +
        'Bringing your own key in your own KMS is not offered yet; do not represent this ' +
        'workspace as holding its own key.',
      href: '/workspace/data',
    };
  }

  if (availability.state === 'revoked') {
    return {
      id: 'encryption-key',
      label: 'Encryption key',
      value: 'Revoked by this workspace',
      state: 'attention',
      enforcement: 'enforced',
      detail:
        'This workspace withdrew its customer-managed key. Anything sealed under it stays ' +
        'sealed and requests that need it are refused; nothing falls back to a platform key. ' +
        `Restore the key in your KMS and reactivate it to read that data again.${rotated}`,
      href: '/workspace/data',
    };
  }

  if (availability.state === 'unavailable') {
    return {
      id: 'encryption-key',
      label: 'Encryption key',
      value: 'Customer-managed, unreachable',
      state: 'attention',
      enforcement: 'enforced',
      detail:
        `The key this workspace manages in its own ${availability.descriptor.provider} could ` +
        `not be used: ${availability.reason}. Requests needing it are refused rather than ` +
        `served with a platform key.${rotated}`,
      href: '/workspace/data',
    };
  }

  return {
    id: 'encryption-key',
    label: 'Encryption key',
    value: stale
      ? `Customer-managed (${availability.descriptor.provider}), rotation overdue`
      : `Customer-managed (${availability.descriptor.provider})`,
    state: stale ? 'attention' : 'ok',
    enforcement: 'enforced',
    detail:
      'The key that wraps this workspace’s data key lives in your own KMS and is never held ' +
      `here. Version ${availability.keyVersion}, in ${availability.descriptor.region}. ` +
      `Revoking our grant on it ends our ability to read your data.${rotated}${staleness}`,
    href: '/workspace/data',
  };
}

function dataRegionSignal(regionState: OrganizationRegionState): PostureSignal {
  const definition = DATA_REGIONS[regionState.effective];
  const pending = regionState.requested
    ? ` A move to ${DATA_REGIONS[regionState.requested].label} is requested and not complete; ` +
      'data is still in the region named above until the copy is verified and cut over.'
    : '';

  if (!regionState.provisioned) {
    return {
      id: 'data-region',
      label: 'Data region',
      value: `${definition.label}, not provisioned`,
      state: 'attention',
      enforcement: 'enforced',
      detail:
        `This workspace is pinned to ${definition.label}, which this deployment cannot serve ` +
        `(${regionState.missing.join(', ')} unset). Requests are refused rather than served ` +
        `from another region.${pending}`,
      href: '/workspace/data',
    };
  }

  return {
    id: 'data-region',
    label: 'Data region',
    value: definition.label,
    state: 'ok',
    enforcement: regionState.effective === DEFAULT_DATA_REGION ? 'stated' : 'enforced',
    detail:
      regionState.effective === DEFAULT_DATA_REGION
        ? 'Rows, objects, logs and keys are in the home region because it is the only region ' +
          'provisioned, not because this workspace chose it. Treat it as where the data is, ' +
          `not as a residency commitment.${pending}`
        : `Rows, objects, logs, keys and inference for this workspace are pinned to ` +
          `${definition.jurisdiction}. A request that cannot be served there is refused.${pending}`,
    href: '/workspace/data',
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
  ownerCount: number;
}): PostureRecommendation[] {
  const out: PostureRecommendation[] = [];

  if (input.ownerCount < MIN_RECOMMENDED_OWNERS) {
    out.push({
      id: 'second-owner',
      title: 'Promote a second owner',
      body: 'A workspace with a single owner cannot be administered if that account is lost, and nobody outside it can restore the role.',
      href: '/workspace/people',
      cta: 'Review people',
    });
  }

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
      body: 'Without it, removing someone from your directory does not remove their access here, an offboarding gap auditors look for.',
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
