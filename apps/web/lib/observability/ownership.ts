import {
  capabilityKillSwitchKey,
  TENANT_LOCKDOWN_FLAG_KEY,
} from '@/lib/feature-flags/kill-switches';

/**
 * Who answers for a domain when it breaks, and what they reach for. Every field
 * points at something that exists elsewhere in the repository rather than
 * restating it: the objective is an id in the SLO catalogue, the dashboard an id
 * in the dashboard catalogue, the dependencies ids in the production dependency
 * registry, the kill switch a flag key the flag store mints, and the runbook a
 * file on disk. A rename on either side fails the guard rather than leaving a
 * page pointing at nothing.
 */
export type OperationalTier = 'critical' | 'standard';

export interface OperationalDomain {
  readonly sloId: string;
  readonly tier: OperationalTier;
  /** The path CODEOWNERS assigns, which is where a change to this domain lands. */
  readonly codeownersPath: string;
  /** The process that runs it, as a path in this repository. */
  readonly runtimePath: string;
  readonly dashboardId: string;
  readonly runbook: string;
  readonly dependencies: readonly string[];
  /** Required for a critical domain: what turns it off without a deploy. */
  readonly killSwitch: string | null;
}

const INCIDENT_RUNBOOK = 'docs/runbooks/incident-response.md';
const ROLLBACK_RUNBOOK = 'docs/runbooks/release-rollback.md';
const BILLING_RUNBOOK = 'docs/runbooks/enterprise-billing.md';
const LOCKOUT_RUNBOOK = 'docs/runbooks/organization-policy-lockout.md';
const DATABASE_RUNBOOK = 'docs/runbooks/database-backup-restore.md';
const CONTINUITY_RUNBOOK = 'docs/runbooks/business-continuity.md';

const WEB_API = 'apps/web';
const MODEL_RUNTIME = 'packages/ai/routing';
const JOB_RUNTIME = 'apps/web/lib/jobs';

export const OPERATIONAL_DOMAINS: readonly OperationalDomain[] = [
  {
    sloId: 'authentication',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/identity',
    dashboardId: 'http-traffic',
    runbook: LOCKOUT_RUNBOOK,
    dependencies: ['identity', 'database'],
    killSwitch: TENANT_LOCKDOWN_FLAG_KEY,
  },
  {
    sloId: 'chat',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: MODEL_RUNTIME,
    dashboardId: 'turn-latency-and-cost',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['model_providers', 'database', 'key_value'],
    killSwitch: capabilityKillSwitchKey('canChat'),
  },
  {
    sloId: 'first-token',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: MODEL_RUNTIME,
    dashboardId: 'turn-latency-and-cost',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['model_providers'],
    killSwitch: capabilityKillSwitchKey('canUseCloudModels'),
  },
  {
    sloId: 'completion',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: MODEL_RUNTIME,
    dashboardId: 'model-regression',
    runbook: ROLLBACK_RUNBOOK,
    dependencies: ['model_providers'],
    killSwitch: capabilityKillSwitchKey('canUseCloudModels'),
  },
  {
    sloId: 'tool-execution',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/app/api/llm/v1/chat/completions/lib',
    dashboardId: 'completion-truth',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['code_execution', 'database'],
    killSwitch: capabilityKillSwitchKey('canUseCloudExecution'),
  },
  {
    sloId: 'work',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: JOB_RUNTIME,
    dashboardId: 'job-health',
    runbook: CONTINUITY_RUNBOOK,
    dependencies: ['database', 'key_value'],
    killSwitch: capabilityKillSwitchKey('work'),
  },
  {
    sloId: 'research',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/services',
    dashboardId: 'completion-truth',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['model_providers', 'database'],
    killSwitch: capabilityKillSwitchKey('canUseDeepResearch'),
  },
  {
    sloId: 'file-upload',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'packages/platform/object-storage',
    dashboardId: 'failures',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['object_storage'],
    killSwitch: capabilityKillSwitchKey('canUploadFiles'),
  },
  {
    sloId: 'file-parsing',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/jobs',
    dashboardId: 'job-health',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['object_storage', 'context_engine'],
    killSwitch: capabilityKillSwitchKey('canUploadFiles'),
  },
  {
    sloId: 'search',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/services',
    dashboardId: 'failures',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['context_engine', 'database'],
    killSwitch: capabilityKillSwitchKey('canUseWebSearch'),
  },
  {
    sloId: 'remote-control',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/services',
    dashboardId: 'failures',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['database', 'key_value'],
    killSwitch: capabilityKillSwitchKey('canUseDesktopAutomation'),
  },
  {
    sloId: 'browser',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/services',
    dashboardId: 'browser-health',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['code_execution'],
    killSwitch: capabilityKillSwitchKey('canUseBrowserAutomation'),
  },
  {
    sloId: 'notifications',
    tier: 'standard',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/services',
    dashboardId: 'notification-delivery',
    runbook: INCIDENT_RUNBOOK,
    dependencies: ['transactional_email'],
    killSwitch: capabilityKillSwitchKey('canUseNotifications'),
  },
  {
    sloId: 'billing-events',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/server/payments',
    dashboardId: 'failures',
    runbook: BILLING_RUNBOOK,
    dependencies: ['billing', 'database'],
    killSwitch: capabilityKillSwitchKey('canUseBilling'),
  },
  {
    sloId: 'billing-usage',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/services',
    dashboardId: 'turn-latency-and-cost',
    runbook: BILLING_RUNBOOK,
    dependencies: ['billing', 'database'],
    killSwitch: capabilityKillSwitchKey('canUseBilling'),
  },
  {
    sloId: 'entitlement-activation',
    tier: 'critical',
    codeownersPath: WEB_API,
    runtimePath: 'apps/web/lib/jobs',
    dashboardId: 'job-health',
    runbook: DATABASE_RUNBOOK,
    dependencies: ['billing', 'database'],
    killSwitch: capabilityKillSwitchKey('canUseBilling'),
  },
];

export function findOperationalDomain(sloId: string): OperationalDomain | null {
  return OPERATIONAL_DOMAINS.find((domain) => domain.sloId === sloId) ?? null;
}

export function criticalDomains(): readonly OperationalDomain[] {
  return OPERATIONAL_DOMAINS.filter((domain) => domain.tier === 'critical');
}
