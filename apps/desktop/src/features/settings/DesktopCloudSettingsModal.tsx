/**
 * DesktopCloudSettingsModal
 *
 * Renders the shared @agiworkforce/ui SettingsModal shell for desktop CLOUD mode.
 * Pattern mirrors apps/web/features/settings/components/WebSettingsModal.tsx:
 *   - sectionContent maps section keys → existing desktop tab components (fully wired, IPC/store-backed)
 *   - A DesktopSettingsDataAdapter bridges the Cloud connectors and managed
 *     skills APIs into the SettingsDataAdapter contract, so the shared
 *     Connectors and Skills panels render real account-owned data.
 *
 * LOCAL mode: NOT used here. App.tsx continues to render SettingsPanel for local mode.
 * CLOUD mode: App.tsx swaps in this component so web + desktop share the same modal shell.
 *
 * Section coverage:
 *   general      → GeneralTab (theme, hotkey, onboarding restart)
 *   account      → AccountTab (cloud identity, plan, credits, and sign-out)
 *   privacy      → PrivacyTab cloud scope (account data, app telemetry, governance)
 *   memory       → MemoryTab  (MemoryEditor from unified-chat)
 *   connectors   → built-in ConnectorsPanel (adapter-driven from api/cloudConnectors.ts —
 *                  a real client of web's /api/connectors, NOT local Tauri connector state;
 *                  see stores/connectorsStore.ts for the separate LOCAL-mode gallery)
 *   skills       → built-in SkillsPanel    (adapter-driven from skillMarketplaceStore)
 *   billing      → DesktopBillingSection   (minimal wired panel — see below)
 *   usage        → DesktopUsageSection     (wraps existing UsageDashboard)
 *   capabilities → DesktopCapabilitiesSection (feature flags + agent mode knobs)
 *
 * Web account sections that remain server-rendered (Security, Notifications,
 * Reflect, Time and focus, and Plugins) open in a content-protected, Desktop-
 * owned child window. Device-only appearance, voice, and model-key settings
 * remain in Local settings and are never blended into the Cloud boundary.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SETTINGS_NAV_GROUPS_WEB, SettingsModal } from '@agiworkforce/ui';
import { toast } from 'sonner';
import type {
  SettingsDataAdapter,
  SettingsSkill,
  SettingsConnector,
  ConnectedConnector,
  SettingsNavGroupResolved,
} from '@agiworkforce/ui';
import { Brain } from 'lucide-react';

import { CONNECTORS } from '../connectors/connectorDefinitions';
import {
  listConnectors as fetchCloudConnectorState,
  connectConnector as apiConnectConnector,
  createCustomConnector as apiCreateCustomConnector,
  deleteCustomConnector as apiDeleteCustomConnector,
  disconnectConnector as apiDisconnectConnector,
  type CloudConnectorEntry,
} from '../../api/cloudConnectors';
import { completeDesktopCloudConnectorInstall } from '../../services/desktopCloudConnectorInstall';
import { openDesktopCloudAccountWindow } from '../../services/desktopCloudAccountWindow';
import { listCloudSkills } from '../../api/cloudSkills';
import {
  createDefaultWindowPreferences,
  getDefaultGlobalHotkeyCombo,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
} from '../../stores/settingsStore';
import { getCloudUsage, type CloudUsage } from '../../api/cloudApi';
import { openBillingPortal } from '../../lib/stripeCheckout';
import { selectHasCloudAccountSession, selectPlan, useAuthStore } from '../../stores/auth';
import type { SettingsTab } from '../../stores/settingsDialogStore';
import { LEGACY_TAB_MAP } from '../../stores/settingsDialogStore';
import { PLAN_DISPLAY_NAMES } from '../../lib/cloudAccountTypes';
import { useShallow } from 'zustand/react/shallow';
import { WEB_APP_URL } from '../../api/config';
import { openExternalUrl } from '../../utils/navigation';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import {
  canUseDesktopCloudAgiWork,
  canUseDesktopCloudCodeExecution,
  canUseDesktopCloudImageGeneration,
} from '../../services/desktopCloudEntitlements';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../../services/managedCloudBoundary';
import {
  canUseBillingPlanCapability,
  getBillingPlanProductLimits,
  type BillingPlanLimit,
} from '@agiworkforce/types';

type CustomConnectorInput = Parameters<NonNullable<SettingsDataAdapter['addCustomConnector']>>[0];

const SETTINGS_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const CONNECTOR_FALLBACK_THEME = 'from-primary/20 to-primary/5 text-primary';
const CLOUD_SETTINGS_SECTIONS = new Set([
  'general',
  'account',
  'team',
  'privacy',
  'billing',
  'usage',
  'capabilities',
  'security',
  'notifications',
  'reflect',
  'time-focus',
  'connectors',
  'skills',
  'plugins',
  'memory',
]);

function resolveCloudSettingsSection(tab: SettingsTab): string {
  if (CLOUD_SETTINGS_SECTIONS.has(tab)) return tab;
  const mapped = (LEGACY_TAB_MAP[tab] ?? tab) as string;
  if (mapped === 'models-keys') return 'capabilities';
  return CLOUD_SETTINGS_SECTIONS.has(mapped) ? mapped : 'general';
}

function formatUsageReset(value: string | null): string {
  if (!value) return 'No active reset window';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Reset time unavailable';
  return `Resets ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
}

const DESKTOP_CLOUD_SETTINGS_NAV: SettingsNavGroupResolved[] = SETTINGS_NAV_GROUPS_WEB.map(
  (group) => ({
    ...group,
    items: group.items.flatMap((item) =>
      item.key === 'capabilities'
        ? [item, { key: 'memory' as const, label: 'Memory', icon: Brain }]
        : [item],
    ),
  }),
);

// ── Tab components (existing, fully wired) ────────────────────────────────────

const LazyGeneralTab = lazy(() =>
  import('./tabs/General').then((m) => ({ default: m.GeneralTab })),
);
const LazyAccountTab = lazy(() =>
  import('./tabs/Account').then((m) => ({ default: m.AccountTab })),
);
const LazyPrivacyTab = lazy(() =>
  import('./tabs/Privacy').then((m) => ({ default: m.PrivacyTab })),
);
const LazyMemoryTab = lazy(() => import('./tabs/Memory').then((m) => ({ default: m.MemoryTab })));
// ── Cloud-only sections that have no dedicated desktop tab ────────────────────

function DesktopBillingSection({ onOpenPlans }: { onOpenPlans: () => void }) {
  const plan = useAuthStore(selectPlan);
  const hasCloudAccountSession = useAuthStore(selectHasCloudAccountSession);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Billing belongs to the Cloud account, not to this device. Without a Cloud
  // session there is no plan to show and no Stripe customer to open a portal
  // for, so say that instead of rendering a plan card the user cannot act on.
  if (!hasCloudAccountSession) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="text-sm text-muted-foreground">
          Connect this Desktop to AGI Cloud to see your plan and manage your subscription.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription, payment method, and top-ups.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-xs text-muted-foreground">Current plan</p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading…'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Upgrades show the exact prorated amount before charging. Downgrades, cancellation, and
          payment methods are managed through Stripe’s secure portal.
        </p>
        {portalError ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {portalError}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 ${SETTINGS_FOCUS_RING}`}
            onClick={onOpenPlans}
          >
            Compare or upgrade
          </button>
          <button
            type="button"
            className={`rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted ${SETTINGS_FOCUS_RING}`}
            disabled={portalLoading}
            aria-busy={portalLoading || undefined}
            onClick={() => {
              setPortalError(null);
              setPortalLoading(true);
              void openBillingPortal(async () => {
                await cloudAccountAuth.refreshUserData();
              })
                .then((error) => {
                  if (error) setPortalError(error);
                })
                .catch((error: unknown) => {
                  setPortalError(
                    error instanceof Error ? error.message : 'Could not open billing.',
                  );
                })
                .finally(() => setPortalLoading(false));
            }}
          >
            {portalLoading ? 'Opening billing…' : 'Manage subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  value,
  resetAt,
}: {
  label: string;
  value: number;
  resetAt: string | null;
}) {
  const normalizedValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {Math.round(normalizedValue)}% used
        </p>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(normalizedValue)}
      >
        <div
          className="h-full rounded-full bg-primary motion-safe:transition-[width]"
          style={{ width: `${normalizedValue}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{formatUsageReset(resetAt)}</p>
    </div>
  );
}

function DesktopUsageSection() {
  const [usage, setUsage] = useState<CloudUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const boundary = captureManagedCloudBoundary('Cloud usage');
      const nextUsage = await getCloudUsage();
      assertManagedCloudBoundary(boundary);
      if (requestGeneration.current === generation) {
        setUsage(nextUsage);
      }
    } catch (cause) {
      if (requestGeneration.current === generation) {
        setError(cause instanceof Error ? cause.message : 'Could not load managed usage.');
      }
    } finally {
      if (requestGeneration.current === generation) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Managed Cloud allowance and rolling safety windows. Exact private ledger operands stay
          server-side.
        </p>
      </div>
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="h-32 rounded-lg bg-muted/40 motion-safe:animate-pulse"
        >
          <span className="sr-only">Loading Cloud usage…</span>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            className={`mt-3 text-xs font-medium text-foreground underline underline-offset-2 ${SETTINGS_FOCUS_RING}`}
            onClick={() => void refresh()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!loading && usage ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <UsageMeter
            label={`${
              PLAN_DISPLAY_NAMES[usage.plan_tier as keyof typeof PLAN_DISPLAY_NAMES] ??
              usage.plan_tier
            } plan`}
            value={usage.usage_percentage}
            resetAt={usage.usage_reset_at}
          />
          <UsageMeter
            label="Current 5-hour window"
            value={usage.session_usage_percentage}
            resetAt={usage.session_reset_at}
          />
          <UsageMeter
            label="Weekly usage"
            value={usage.weekly_usage_percentage}
            resetAt={usage.weekly_reset_at}
          />
          <UsageMeter
            label="Flagship model weekly usage"
            value={usage.flagship_weekly_usage_percentage}
            resetAt={usage.flagship_weekly_reset_at}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatPlanLimit(limit: BillingPlanLimit | undefined): string {
  if (limit === 'unlimited') return 'Unlimited';
  if (limit === 'custom') return 'Custom';
  return typeof limit === 'number' ? new Intl.NumberFormat().format(limit) : 'Unavailable';
}

/** Managed capability status. Native Local agent controls stay in Local settings. */
function DesktopCapabilitiesSection() {
  const featureFlags = useAuthStore((state) => state.featureFlags);
  const plan = useAuthStore(selectPlan);
  const limits = getBillingPlanProductLimits(plan);
  const codeExecutionConfigured = featureFlags['code_execution'] === true;
  const codeExecutionAvailable = canUseDesktopCloudCodeExecution(plan, codeExecutionConfigured);
  const capabilities = [
    {
      label: 'Managed code execution',
      description: 'Run supported code in an isolated AGI Cloud sandbox.',
      status:
        plan === null
          ? 'Loading'
          : codeExecutionAvailable
            ? 'Available'
            : codeExecutionConfigured
              ? 'Not in plan'
              : 'Not configured',
    },
    {
      label: 'Managed web search',
      description: 'Search and fetch current web sources when the selected model supports it.',
      status:
        featureFlags['generic_web_search'] === true || featureFlags['native_web_search'] === true
          ? 'Available'
          : 'Model-dependent',
    },
    {
      label: 'AGI Work',
      description: 'Run multi-step managed tasks with tools and reviewable deliverables.',
      status:
        plan === null ? 'Loading' : canUseDesktopCloudAgiWork(plan) ? 'Available' : 'Pro required',
    },
    {
      label: 'Image generation',
      description: 'Create durable images that remain available after reload.',
      status:
        plan === null
          ? 'Loading'
          : canUseDesktopCloudImageGeneration(plan)
            ? 'Available'
            : 'Pro required',
    },
    {
      label: 'Cloud files and tools',
      description: 'Upload supported files and use account-authorized managed tools.',
      status:
        plan === null
          ? 'Loading'
          : canUseBillingPlanCapability(plan, 'chat_tools')
            ? 'Available'
            : 'Not in plan',
    },
    {
      label: 'Cloud projects and sync',
      description:
        'Keep account-owned chats, project instructions, and sources available across surfaces.',
      status:
        plan === null
          ? 'Loading'
          : canUseBillingPlanCapability(plan, 'projects')
            ? 'Available'
            : 'Not in plan',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Capabilities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Capabilities authorized for this AGI Cloud account and deployment.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card/40">
        {capabilities.map((capability, index) => (
          <div
            key={capability.label}
            className={`flex items-start justify-between gap-4 p-5 ${
              index > 0 ? 'border-t border-border/60' : ''
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{capability.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {capability.description}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                capability.status === 'Available'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {capability.status}
            </span>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">Current plan limits</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          These limits are enforced by AGI Cloud across Desktop, Web, and Mobile.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ['Parallel managed turns', formatPlanLimit(limits?.maxConcurrentTurns)],
            ['Live managed sandboxes', formatPlanLimit(limits?.maxSandboxes)],
            ['Connector tools per turn', formatPlanLimit(limits?.maxConnectorTools)],
            ['Scheduled tasks', formatPlanLimit(limits?.maxScheduledTasks)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-card/40 p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Tool approvals are enforced by the Managed Cloud policy for each task. Local agent and
        auto-approval controls apply only to the Local workspace and remain in Local settings.
      </p>
    </div>
  );
}

function DesktopTeamSection() {
  const plan = useAuthStore(selectPlan);
  const canManageTeam = canUseBillingPlanCapability(plan, 'team_admin');
  const isEnterprise = canUseBillingPlanCapability(plan, 'enterprise_controls');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openTeamSettings = () =>
    openDesktopCloudAccountWindow('/settings/team', 'AGI Cloud team settings');
  const openSales = () => openExternalUrl(new URL('/contact-sales', WEB_APP_URL).toString());
  const handleOpenTeamAction = async () => {
    if (opening || plan === null) return;
    setOpening(true);
    setError(null);
    try {
      await (canManageTeam ? openTeamSettings() : openSales());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : canManageTeam
            ? 'Could not open team settings.'
            : 'Could not open contact sales.',
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Team &amp; enterprise</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage workspace membership and organization administration in an owned AGI Desktop
          window.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-xs text-muted-foreground">Current plan</p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {plan ? PLAN_DISPLAY_NAMES[plan] : 'Loading…'}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {canManageTeam
            ? 'Open the protected Cloud team controls to manage owner, admin, and member roles.'
            : 'Team administration requires a provisioned Team or Enterprise account.'}
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className={`mt-4 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50 ${SETTINGS_FOCUS_RING}`}
          onClick={() => void handleOpenTeamAction()}
          disabled={plan === null || opening}
          aria-busy={opening || undefined}
        >
          {opening ? 'Opening…' : canManageTeam ? 'Manage team' : 'Contact sales'}
        </button>
      </div>

      {isEnterprise ? (
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <p className="text-sm font-medium text-foreground">Enterprise identity</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            This Desktop build does not expose SSO or SCIM configuration. No identity-provider setup
            is implied by the Enterprise plan label.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DesktopCloudAccountSection({
  title,
  description,
  path,
  action,
}: {
  title: string;
  description: string;
  path: string;
  action: string;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-foreground">
          This account surface opens in a content-protected child window owned by AGI Desktop.
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          It uses the Cloud account boundary and never receives Local chats, files, model keys, or
          workspace permissions.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className={`mt-4 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50 ${SETTINGS_FOCUS_RING}`}
          disabled={opening}
          aria-busy={opening || undefined}
          onClick={() => {
            setError(null);
            setOpening(true);
            void openDesktopCloudAccountWindow(path, `AGI Cloud ${title}`)
              .catch((openError: unknown) => {
                setError(
                  openError instanceof Error
                    ? openError.message
                    : `Could not open ${title.toLocaleLowerCase()}.`,
                );
              })
              .finally(() => setOpening(false));
          }}
        >
          {opening ? 'Opening…' : action}
        </button>
      </div>
    </div>
  );
}

// ── Skeleton shown while a section is hydrating ───────────────────────────────

function SectionSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6 motion-safe:animate-pulse">
      <span className="sr-only">Loading settings…</span>
      <div className="h-5 w-40 rounded bg-muted/30" />
      <div className="h-4 w-72 rounded bg-muted/20" />
      <div className="h-36 w-full rounded-xl bg-muted/20" />
    </div>
  );
}

/**
 * Desktop's static catalog (apps/desktop/src/features/connectors/connectorDefinitions.ts)
 * and the server's connector-id namespace (VALID_CONNECTOR_IDS in
 * apps/web/app/api/connectors/route.ts) mostly agree, but four desktop ids
 * differ from what the server — and its `user_connectors.connector_id` rows —
 * expect: three underscore/hyphen mismatches and one outright rename
 * (microsoft_teams → teams). Reconciled here rather than by renaming the
 * catalog ids, since local Tauri/MCP connect flows key on the catalog id as-is.
 * Every other desktop id that has no server counterpart (e.g. figma, canva,
 * vercel, atlassian — see the audit note below) is intentionally left
 * unmapped: it will never appear in `available`, so it correctly renders
 * "Coming soon" without needing an entry here.
 */
const DESKTOP_TO_SERVER_CONNECTOR_ID: Record<string, string> = {
  google_calendar: 'google-calendar',
  google_drive: 'google-drive',
  google_sheets: 'google-sheets',
  microsoft_teams: 'teams',
};

const SERVER_TO_DESKTOP_CONNECTOR_ID: Record<string, string> = Object.fromEntries(
  Object.entries(DESKTOP_TO_SERVER_CONNECTOR_ID).map(([desktopId, serverId]) => [
    serverId,
    desktopId,
  ]),
);

/** Desktop catalog id → server connector id, for POST/DELETE calls and the `available` lookup. */
function toServerConnectorId(desktopId: string): string {
  return DESKTOP_TO_SERVER_CONNECTOR_ID[desktopId] ?? desktopId;
}

/** Server connector id (from GET /api/connectors) → desktop catalog id, for display/matching. */
function toDesktopConnectorId(serverId: string): string {
  return SERVER_TO_DESKTOP_CONNECTOR_ID[serverId] ?? serverId;
}

function toDisplayConnectorId(connector: CloudConnectorEntry): string {
  return connector.source === 'custom'
    ? `custom-${connector.id}`
    : toDesktopConnectorId(connector.connectorId);
}

/**
 * Maps desktop's ConnectorDef[] (names/logos/categories — static catalog
 * metadata) → shared SettingsConnector[], gated by the server's `available`
 * ids so "Connect" only lights up for connectors the cloud backend can
 * actually enable right now (see listConnectors() in api/cloudConnectors.ts).
 * Everything else renders "Coming soon" instead of a fake-connectable entry.
 */
function toSettingsConnectors(availableIds: ReadonlySet<string>): SettingsConnector[] {
  return CONNECTORS.map((c) => {
    const canConnect = availableIds.has(toServerConnectorId(c.id));
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category,
      authType: c.authType,
      // The server does not expose a verified tool/action count. Zero keeps
      // the optional Actions row hidden instead of fabricating a metric from
      // static catalog order.
      actionCount: 0,
      // comingSoon → phase 2 so the shared shell renders "Soon"
      phase: c.comingSoon ? 2 : 1,
      iconBg: CONNECTOR_FALLBACK_THEME,
      iconText: c.name.slice(0, 2).toUpperCase(),
      canConnect,
      statusLabel: canConnect ? undefined : 'Coming soon',
    };
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DesktopCloudSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DesktopCloudSettingsModal({
  open,
  onClose,
  initialTab = 'general',
}: DesktopCloudSettingsModalProps) {
  const [activeSection, setActiveSection] = useState<string>(() =>
    resolveCloudSettingsSection(initialTab),
  );

  // Sync when the dialog is re-opened with a different tab
  useEffect(() => {
    if (open) setActiveSection(resolveCloudSettingsSection(initialTab));
  }, [open, initialTab]);

  // ── Connectors (CLOUD state — real client of web's /api/connectors) ──────
  // Trust boundary: this section reflects server truth, not local Tauri MCP
  // connector state (see stores/connectorsStore.ts, which stays wired to the
  // LOCAL settings' ConnectorGallery only — never blended in here).
  const [cloudConnectors, setCloudConnectors] = useState<CloudConnectorEntry[] | undefined>(
    undefined,
  );
  const [availableConnectorIds, setAvailableConnectorIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [hasLoadedConnectors, setHasLoadedConnectors] = useState(false);
  const [connectorsError, setConnectorsError] = useState<string | null>(null);
  const connectorsRequestGeneration = useRef(0);

  const refreshCloudConnectors = useCallback(async () => {
    const generation = ++connectorsRequestGeneration.current;
    const { connectors, available } = await fetchCloudConnectorState();
    if (connectorsRequestGeneration.current === generation) {
      setCloudConnectors(connectors);
      setAvailableConnectorIds(new Set(available));
      setConnectorsError(null);
      setHasLoadedConnectors(true);
    }
    return connectors;
  }, []);

  const loadCloudConnectors = useCallback(async () => {
    const generation = connectorsRequestGeneration.current + 1;
    setConnectorsLoading(true);
    setConnectorsError(null);
    try {
      await refreshCloudConnectors();
    } catch (error) {
      if (connectorsRequestGeneration.current === generation) {
        setHasLoadedConnectors(true);
        setConnectorsError(
          error instanceof Error ? error.message : 'Could not load Cloud connectors.',
        );
      }
    } finally {
      if (connectorsRequestGeneration.current === generation) {
        setConnectorsLoading(false);
      }
    }
  }, [refreshCloudConnectors]);

  useEffect(() => {
    if (!open || activeSection !== 'connectors' || hasLoadedConnectors || connectorsLoading) {
      return;
    }
    void loadCloudConnectors();
  }, [open, activeSection, hasLoadedConnectors, connectorsLoading, loadCloudConnectors]);

  // cloudConnectors always holds server-shaped rows (server id space); the
  // adapter surface (connectedConnectors / SettingsConnector.id) always uses
  // desktop's catalog id space. Translate exactly at these two boundaries —
  // see toServerConnectorId/toDesktopConnectorId above.
  const connectedConnectors: ConnectedConnector[] | undefined = useMemo(
    () =>
      cloudConnectors?.map((c) => ({
        connectorId: toDisplayConnectorId(c),
        connectedAt: c.connectedAt || undefined,
        status: 'connected' as const,
      })),
    [cloudConnectors],
  );

  const connectConnector = useCallback(
    async (id: string) => {
      const serverId = toServerConnectorId(id);
      const authType = CONNECTORS.find((connector) => connector.id === id)?.authType;
      const result = await apiConnectConnector(serverId, authType);
      if (result.status === 'connected') {
        setCloudConnectors((prev) => [
          ...(prev ?? []).filter((c) => c.connectorId !== serverId),
          result.connector,
        ]);
        return;
      }
      if (result.status === 'install-required') {
        await completeDesktopCloudConnectorInstall(result.installUrl, {
          isConnected: async () => {
            const connectors = await refreshCloudConnectors();
            return connectors.some(
              (connector) =>
                connector.connectorId === serverId && connector.source === 'github-app',
            );
          },
        });
        await refreshCloudConnectors();
        return;
      }
      throw new Error(result.message);
    },
    [refreshCloudConnectors],
  );

  const disconnectConnector = useCallback(
    async (id: string) => {
      if (id.startsWith('custom-')) {
        const custom = cloudConnectors?.find(
          (connector) => connector.source === 'custom' && toDisplayConnectorId(connector) === id,
        );
        if (!custom) throw new Error('This custom connector could not be found.');
        await apiDeleteCustomConnector(custom.id);
        setCloudConnectors((prev) =>
          (prev ?? []).filter((connector) => connector.id !== custom.id),
        );
        return;
      }
      const serverId = toServerConnectorId(id);
      await apiDisconnectConnector(serverId);
      setCloudConnectors((prev) => (prev ?? []).filter((c) => c.connectorId !== serverId));
    },
    [cloudConnectors],
  );

  const addCustomConnector = useCallback(
    async (input: CustomConnectorInput) => {
      await apiCreateCustomConnector(input);
      await refreshCloudConnectors();
    },
    [refreshCloudConnectors],
  );

  // ── Skills (Managed Cloud catalog — the same source chat admission uses) ─
  const [skills, setSkills] = useState<SettingsSkill[] | undefined>(undefined);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [hasLoadedSkills, setHasLoadedSkills] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const skillsRequestGeneration = useRef(0);

  const loadCloudSkills = useCallback(async () => {
    const generation = ++skillsRequestGeneration.current;
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const catalog = await listCloudSkills();
      if (skillsRequestGeneration.current === generation) {
        setSkills(
          catalog.map((skill) => ({
            id: skill.name,
            name: skill.name,
            description: skill.description,
            source: skill.source,
            tab: skill.source === 'builtin' ? 'prompts' : 'agents',
          })),
        );
        setHasLoadedSkills(true);
      }
    } catch (error) {
      if (skillsRequestGeneration.current === generation) {
        setHasLoadedSkills(true);
        setSkillsError(error instanceof Error ? error.message : 'Could not load Cloud skills.');
      }
    } finally {
      if (skillsRequestGeneration.current === generation) {
        setSkillsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || activeSection !== 'skills' || hasLoadedSkills || skillsLoading) return;
    void loadCloudSkills();
  }, [open, activeSection, hasLoadedSkills, skillsLoading, loadCloudSkills]);

  useEffect(() => {
    if (open) return;
    connectorsRequestGeneration.current += 1;
    skillsRequestGeneration.current += 1;
    setCloudConnectors(undefined);
    setAvailableConnectorIds(new Set());
    setConnectorsLoading(false);
    setHasLoadedConnectors(false);
    setConnectorsError(null);
    setSkills(undefined);
    setSkillsLoading(false);
    setHasLoadedSkills(false);
    setSkillsError(null);
  }, [open]);

  const settingsConnectors: SettingsConnector[] | undefined = useMemo(() => {
    if (cloudConnectors === undefined) return undefined;
    const custom = cloudConnectors
      .filter((connector) => connector.source === 'custom')
      .map((connector) => ({
        id: toDisplayConnectorId(connector),
        name: connector.name ?? 'Custom MCP',
        description: 'Private remote MCP connector',
        category: 'Custom',
        authType: 'custom_mcp',
        actionCount: 0,
        phase: 1,
        iconBg: CONNECTOR_FALLBACK_THEME,
        iconText: 'MCP',
        canConnect: false,
      }));
    return [...toSettingsConnectors(availableConnectorIds), ...custom];
  }, [availableConnectorIds, cloudConnectors]);

  // ── Data adapter ─────────────────────────────────────────────────────────
  const adapter: SettingsDataAdapter = useMemo(
    () => ({
      connectors: settingsConnectors,
      connectorsLoading,
      connectorsError,
      retryConnectors: loadCloudConnectors,
      connectedConnectors,
      connectConnector,
      disconnectConnector,
      addCustomConnector,
      customConnectorAuthTokenSupported: true,
      openHref: (href) => {
        const url = new URL(href, WEB_APP_URL);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          throw new Error('Only HTTP(S) settings links can be opened.');
        }
        return openExternalUrl(url.toString());
      },
      skills,
      skillsLoading,
      skillsError,
      retrySkills: loadCloudSkills,
    }),
    [
      settingsConnectors,
      connectorsLoading,
      connectorsError,
      loadCloudConnectors,
      connectedConnectors,
      connectConnector,
      disconnectConnector,
      addCustomConnector,
      skills,
      skillsLoading,
      skillsError,
      loadCloudSkills,
    ],
  );

  // ── GeneralTab props (mirrors SettingsPanel wiring) ──────────────────────
  const windowPreferences = useSettingsStore(useShallow((s) => s.windowPreferences));
  const globalHotkeyPreferences = useSettingsStore(useShallow((s) => s.globalHotkeyPreferences));
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setGlobalHotkeyEnabled = useSettingsStore((s) => s.setGlobalHotkeyEnabled);
  const setGlobalHotkeyCombo = useSettingsStore((s) => s.setGlobalHotkeyCombo);
  const saveSettings = useSettingsStore((s) => s.saveSettings);

  const resolvedWindowPreferences = useMemo(
    () => windowPreferences ?? createDefaultWindowPreferences(),
    [windowPreferences],
  );
  const defaultGlobalHotkeyCombo = getDefaultGlobalHotkeyCombo();
  const resolvedGlobalHotkeyPreferences: GlobalHotkeyPreferences = useMemo(
    () => globalHotkeyPreferences ?? { enabled: true, combo: defaultGlobalHotkeyCombo },
    [globalHotkeyPreferences, defaultGlobalHotkeyCombo],
  );

  const openPlans = useCallback(() => {
    // Close Settings before opening Pricing so two modal focus traps never
    // overlap. This keeps keyboard focus and animation behavior deterministic.
    onClose();
    window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }));
  }, [onClose]);

  // ── Auto-save general settings when section changes away from general ─────
  const prevSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevSectionRef.current === 'general' && activeSection !== 'general') {
      void saveSettings().catch((error: unknown) => {
        toast.error('Device settings were not saved', {
          description: error instanceof Error ? error.message : String(error),
        });
      });
    }
    prevSectionRef.current = activeSection;
  }, [activeSection, saveSettings]);

  // ── Section content map ──────────────────────────────────────────────────
  const sectionContent: Partial<Record<string, React.ReactNode>> = useMemo(
    () => ({
      general: (
        <div className="flex flex-col gap-8">
          <DesktopCloudAccountSection
            title="Cloud profile"
            description="Update your name, preferred form of address, work description, and account-level instructions."
            path="/settings/general"
            action="Open profile settings"
          />
          <div className="border-t border-border pt-8">
            <Suspense fallback={<SectionSkeleton />}>
              <LazyGeneralTab
                resolvedWindowPreferences={resolvedWindowPreferences}
                resolvedGlobalHotkeyPreferences={resolvedGlobalHotkeyPreferences}
                defaultGlobalHotkeyCombo={defaultGlobalHotkeyCombo}
                onThemeChange={(value: 'light' | 'dark' | 'system') => setTheme(value)}
                onLanguageChange={(value: Language) => setLanguage(value)}
                onGlobalHotkeyEnabledChange={(value: boolean) => setGlobalHotkeyEnabled(value)}
                onGlobalHotkeyComboChange={(value: string) => setGlobalHotkeyCombo(value)}
              />
            </Suspense>
          </div>
        </div>
      ),
      account: (
        <Suspense fallback={<SectionSkeleton />}>
          <LazyAccountTab scope="cloud" />
        </Suspense>
      ),
      team: <DesktopTeamSection />,
      privacy: (
        <Suspense fallback={<SectionSkeleton />}>
          <LazyPrivacyTab scope="cloud" />
        </Suspense>
      ),
      billing: <DesktopBillingSection onOpenPlans={openPlans} />,
      usage: <DesktopUsageSection />,
      capabilities: <DesktopCapabilitiesSection />,
      security: (
        <DesktopCloudAccountSection
          title="Security"
          description="Manage password, two-factor authentication, and account session timeout."
          path="/settings/security"
          action="Open security controls"
        />
      ),
      notifications: (
        <DesktopCloudAccountSection
          title="Notifications"
          description="Manage Cloud reply-ready notifications alongside Desktop’s native notification controls."
          path="/settings/notifications"
          action="Open notification settings"
        />
      ),
      reflect: (
        <DesktopCloudAccountSection
          title="Reflect"
          description="Review an account-level recap of activity, topics, and memory-backed insights."
          path="/settings/reflect"
          action="Open Reflect"
        />
      ),
      'time-focus': (
        <DesktopCloudAccountSection
          title="Time and focus"
          description="Configure break reminders and quiet hours for your signed-in Cloud account."
          path="/settings/time-focus"
          action="Open time and focus"
        />
      ),
      plugins: (
        <DesktopCloudAccountSection
          title="Plugins"
          description="Discover and manage account-installed Cloud plugins. Local extensions remain isolated in Local settings."
          path="/settings/plugins"
          action="Open Cloud plugins"
        />
      ),
      memory: (
        <Suspense fallback={<SectionSkeleton />}>
          <LazyMemoryTab scope="cloud" />
        </Suspense>
      ),
      // connectors / skills fall through to adapter-driven built-in panels
    }),

    [
      resolvedWindowPreferences,
      resolvedGlobalHotkeyPreferences,
      defaultGlobalHotkeyCombo,
      openPlans,
      setTheme,
      setLanguage,
      setGlobalHotkeyEnabled,
      setGlobalHotkeyCombo,
    ],
  );

  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      sectionContent={sectionContent}
      navGroups={DESKTOP_CLOUD_SETTINGS_NAV}
      adapter={adapter}
      title="Settings"
    />
  );
}
