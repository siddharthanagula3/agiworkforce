'use client';

/**
 * WebSettingsModal — wires the shared @agiworkforce/ui SettingsModal shell
 * to real section content from features/settings/sections/*.
 *
 * Section content is imported from dedicated Section components (NOT from
 * route pages, which are now <SettingsModalRedirect> stubs for deep-linking).
 *
 * Sections wired:
 *   general      -> GeneralSection  (profile + preferences + danger zone)
 *   account      -> AccountSection  (sessions, user ID, logout)
 *   team         -> TeamSection     (workspace + member administration)
 *   security     -> SecuritySection (2FA, session timeout, change password)
 *   safety       -> SafetySection (strict content admission)
 *   privacy      -> PrivacySection  (toggles, export, delete)
 *   archived      -> ArchivedChatsSection (restore + permanent delete)
 *   deleted-chats -> DeletedChatsSection (restore soft-deleted conversations)
 *   shared-links -> SharedLinksSection (review + revoke)
 *   billing      -> BillingSection  (plan, payment, invoices)
 *   usage        -> UsageSection    (credit bars, analytics)
 *   capabilities -> CapabilitiesSection (memory, tools, artifacts)
 *   memory       -> MemorySection   (MemoryEditor)
 *   notifications -> NotificationsSection (browser/email/mobile-push toggles)
 *   reflect      -> ReflectSection (on-demand account activity recap)
 *   time-focus   -> TimeFocusSection (account-wide quiet hours + break reminders)
 *   help         -> HelpSection (docs, support, status, release notes, legal)
 *   connectors   -> ConnectorsPanel (built-in to shared shell via adapter)
 *   skills       -> SkillsPanel     (built-in to shared shell via adapter)
 *   plugins      -> PluginsPanel    (built-in to shared shell via adapter)
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SettingsModal, SETTINGS_NAV_GROUPS_WEB } from '@agiworkforce/ui';
import type { SettingsDataAdapter, SettingsPlugin, SettingsSkill } from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { ConnectorConsentSummary } from '@/features/connectors/components/ConnectorConsentSummary';
import { PLUGIN_CATALOG } from '@/features/plugins/data/plugins';
import { getCsrfToken } from '@/lib/client/csrf';

// Section components — real wired content, NOT route stubs
import { GeneralSection } from '../sections/GeneralSection';
import { AccountSection } from '../sections/AccountSection';
import { TeamSection } from '../sections/TeamSection';
import { OrganizationSharingSection } from '../sections/OrganizationSharingSection';
import { SecuritySection } from '../sections/SecuritySection';
import { SafetySection } from '../sections/SafetySection';
import { PrivacySection } from '../sections/PrivacySection';
import { ArchivedChatsSection } from '../sections/ArchivedChatsSection';
import { DeletedChatsSection } from '../sections/DeletedChatsSection';
import { SharedLinksSection } from '../sections/SharedLinksSection';
import { BillingSection } from '../sections/BillingSection';
import { UsageSection } from '../sections/UsageSection';
import { CapabilitiesSection } from '../sections/CapabilitiesSection';
import { MemorySection } from '../sections/MemorySection';
import { NotificationsSection } from '../sections/NotificationsSection';
import { ReflectSection } from '../sections/ReflectSection';
import { TimeFocusSection } from '../sections/TimeFocusSection';
import { HelpSection } from '../sections/HelpSection';

// ---------------------------------------------------------------------------
// Skeleton shown while a section is still hydrating
// ---------------------------------------------------------------------------

function SectionSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-6 w-48 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <div className="h-4 w-80 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
      <div className="h-40 w-full rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills API type
// ---------------------------------------------------------------------------

interface ApiSkill {
  name: string;
  description: string;
  source: string;
}

// ---------------------------------------------------------------------------
// URL segment <-> section key mapping
// ---------------------------------------------------------------------------

const SECTION_TO_SEGMENT: Record<string, string> = {
  general: 'general',
  account: 'account',
  team: 'team',
  security: 'security',
  safety: 'safety',
  privacy: 'privacy',
  archived: 'archived',
  'deleted-chats': 'deleted-chats',
  'shared-links': 'shared-links',
  billing: 'billing',
  usage: 'usage',
  capabilities: 'capabilities',
  connectors: 'connectors',
  skills: 'skills',
  plugins: 'plugins',
  memory: 'memory',
  notifications: 'notifications',
  reflect: 'reflect',
  'time-focus': 'time-focus',
  help: 'help',
};

const SEGMENT_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTION_TO_SEGMENT).map(([k, v]) => [v, k]),
);

// ---------------------------------------------------------------------------
// Connector catalog -> SettingsConnector shape
//
// HONEST WEB SEMANTICS (known-flaws WEB-CONNECTORS row): the catalog's
// `exclusive` connectors are local-only (filesystem/terminal/browser/vision/
// ollama) — the cloud web server cannot run them, so they are excluded
// entirely. For everything else, POST /api/connectors deliberately 501s
// (no per-provider authorization flow is implemented on web yet), so NO
// connector renders a Connect button here (canConnect: false) — the table
// shows a truthful status label instead of a button that is known to fail.
// Connected state still renders from real data: active user_connectors rows
// (GET /api/connectors) and, for GitHub, real GitHub App installations.
// ---------------------------------------------------------------------------

const SETTINGS_CONNECTORS = CONNECTORS.filter((c) => !c.exclusive).map((c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  category: c.category,
  authType: c.authType,
  actionCount: c.actionCount,
  phase: c.phase,
  iconBg: c.iconBg,
  iconText: c.iconText,
  canConnect: false,
  statusLabel: c.phase > 1 ? 'Coming soon' : 'Not yet available on web',
}));

const SETTINGS_PLUGIN_CATALOG: SettingsPlugin[] = PLUGIN_CATALOG.map((plugin) => ({
  id: plugin.id,
  name: plugin.name,
  description: plugin.description,
  enabled: false,
  author: plugin.author,
  skillCount: plugin.skills.length,
  statusLabel: 'Catalogue preview',
  detailsHref: `/plugins/${plugin.id}`,
}));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WebSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialSection?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebSettingsModal({
  open,
  onClose,
  initialSection = 'general',
}: WebSettingsModalProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Derive section from current URL path (deep-link support)
  const sectionFromPath = (() => {
    if (!pathname) return null;
    const match = pathname.match(/^\/settings\/([^/]+)/);
    if (match?.[1] && SEGMENT_TO_SECTION[match[1]]) return SEGMENT_TO_SECTION[match[1]];
    if (pathname.startsWith('/connectors')) return 'connectors';
    if (pathname.startsWith('/skills')) return 'skills';
    if (pathname.startsWith('/apps')) return 'plugins';
    return null;
  })();

  const [activeSection, setActiveSection] = useState<string>(sectionFromPath ?? initialSection);

  // Sync the active section when the URL changes (deep-link) OR when the modal is
  // (re)opened to a requested section. The modal stays mounted (open=false) between
  // uses, so the useState initializer alone won't pick up a newly-requested
  // initialSection (e.g. the rail's "Customize" → openSettings('skills')) — sync on open.
  useEffect(() => {
    if (sectionFromPath) {
      setActiveSection(sectionFromPath);
    } else if (open) {
      setActiveSection(initialSection);
    }
  }, [open, initialSection, sectionFromPath]);

  const handleSectionChange = useCallback(
    (key: string) => {
      setActiveSection(key);
      const segment = SECTION_TO_SEGMENT[key];
      if (segment) {
        const href =
          key === 'connectors'
            ? '/connectors'
            : key === 'skills'
              ? '/skills'
              : key === 'plugins'
                ? '/apps'
                : `/settings/${segment}`;
        router.replace(href, { scroll: false });
      }
    },
    [router],
  );

  // ── Connected connectors state ─────────────────────────────────────────────
  // Three REAL sources (no optimistic fakery):
  //   1. Active user_connectors rows (GET /api/connectors) — the per-user
  //      enablement gate.
  //   2. GitHub App installations (GET /api/github/installations) — GitHub
  //      cannot have a user_connectors row (known-flaws WEB-CONNECTORS row);
  //      the installation IS the real "connected" signal, matching what the
  //      chat tool loop actually offers.
  //   3. The user's own custom remote MCP connectors (GET /api/connectors/custom)
  //      — these have no static catalog entry, so they're synthesized into
  //      both `connectors` (the catalog the shared table renders) and
  //      `connectedConnectors` below, namespaced `custom-<row id>` to match
  //      the chat tool loop (lib/user-connector-tools.ts).

  const [connectedConnectors, setConnectedConnectors] = useState<
    { connectorId: string; connectedAt?: string }[]
  >([]);
  // OAuth grants the server reports as expired or revoked. `/api/connectors`
  // has always returned this per row; nothing outside the Connectors page read
  // it, so a connector could stop working and the only way to find out was to
  // open that one page and scroll to the right row.
  const [expiredConnectorIds, setExpiredConnectorIds] = useState<string[]>([]);
  const [githubInstallations, setGithubInstallations] = useState<
    { installation_id: number; created_at?: string }[]
  >([]);
  // Connector ids the server reports as actually connectable on web (GET
  // /api/connectors `available`): github when the GitHub App is configured, plus
  // operator-mapped remote MCP connectors. Drives canConnect instead of a
  // build-time hardcoded false.
  const [availableIds, setAvailableIds] = useState<string[]>([]);
  const [customConnectors, setCustomConnectors] = useState<
    { id: string; name: string; url: string; createdAt: string }[]
  >([]);

  const refreshCustomConnectors = useCallback(() => {
    return fetch('/api/connectors/custom', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as {
          connectors: Array<{ id: string; name: string; url: string; createdAt: string }>;
        };
        setCustomConnectors(json.connectors ?? []);
      })
      .catch(() => {
        // degrade gracefully
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/connectors', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          connectors: Array<{
            connectorId: string;
            connectedAt?: string;
            needsReauthorization?: boolean;
          }>;
          available?: string[];
        };
        if (!cancelled) {
          setConnectedConnectors(json.connectors ?? []);
          setAvailableIds(json.available ?? []);
          setExpiredConnectorIds(
            (json.connectors ?? []).filter((c) => c.needsReauthorization).map((c) => c.connectorId),
          );
        }
      })
      .catch(() => {
        // degrade gracefully
      });
    fetch('/api/github/installations', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          installations: Array<{ installation_id: number; created_at?: string }>;
        };
        if (!cancelled) setGithubInstallations(json.installations ?? []);
      })
      .catch(() => {
        // degrade gracefully
      });
    void refreshCustomConnectors();
    return () => {
      cancelled = true;
    };
  }, [open, refreshCustomConnectors]);

  const customSettingsConnectors = useMemo(
    () =>
      customConnectors.map((c) => ({
        id: `custom-${c.id}`,
        name: c.name,
        description: c.url,
        category: 'Custom',
        authType: 'custom_mcp',
        actionCount: 0,
        phase: 1,
        iconBg: 'from-slate-500 to-slate-600',
        iconText: 'MCP',
        canConnect: false,
      })),
    [customConnectors],
  );

  const mergedSettingsConnectors = useMemo(
    () =>
      [
        ...SETTINGS_CONNECTORS.map((c) =>
          availableIds.includes(c.id) ? { ...c, canConnect: true, statusLabel: undefined } : c,
        ),
        ...customSettingsConnectors,
      ] as typeof SETTINGS_CONNECTORS,
    [availableIds, customSettingsConnectors],
  );

  const mergedConnectedConnectors = useMemo(() => {
    // Drop github AND custom rows from the raw /api/connectors list: github is
    // re-derived from real installations below, and custom rows are re-pushed
    // from the richer /api/connectors/custom fetch (this modal keys customs by
    // `custom-<row uuid>` because its remove flow slices the uuid back out;
    // the API's connectorId uses `custom-<shortId>`, the chat serverId).
    const rows = connectedConnectors.filter(
      (c) => c.connectorId !== 'github' && !c.connectorId.startsWith('custom-'),
    );
    if (githubInstallations.length > 0) {
      rows.push({ connectorId: 'github', connectedAt: githubInstallations[0]?.created_at });
    }
    for (const c of customConnectors) {
      rows.push({ connectorId: `custom-${c.id}`, connectedAt: c.createdAt });
    }
    return rows;
  }, [connectedConnectors, githubInstallations, customConnectors]);

  const connectConnector = useCallback(async (id: string) => {
    // Web has no working per-provider authorization flow yet, so the catalog
    // is mapped with canConnect: false and the shared panel never invokes
    // this. Kept non-optimistic for when a real flow lands: POST first, only
    // reflect state the server confirmed, surface failures to the panel.
    const connector = SETTINGS_CONNECTORS.find((c) => c.id === id);
    if (!connector) return;
    const csrfToken = await getCsrfToken();
    const res = await fetch('/api/connectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ connectorId: id, authType: connector.authType }),
    });
    if (!res.ok) {
      // GitHub connects through the App install flow: the server answers POST
      // with 409 + installStartPath. Follow it instead of surfacing an error.
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as { error?: string; installStartPath?: string } | null;
      if (res.status === 409 && body?.installStartPath && typeof window !== 'undefined') {
        window.location.href = body.installStartPath;
        return;
      }
      throw new Error(body?.error ?? `Could not connect ${connector.name}.`);
    }
    const json = (await res.json()) as {
      connector: { connectorId: string; connectedAt?: string };
    };
    setConnectedConnectors((prev) => [
      ...prev.filter((c) => c.connectorId !== id),
      { connectorId: json.connector.connectorId, connectedAt: json.connector.connectedAt },
    ]);
  }, []);

  const disconnectConnector = useCallback(
    async (id: string) => {
      const csrfToken = await getCsrfToken();
      if (id === 'github') {
        // GitHub "connected" state is its App installations; disconnect
        // removes each installation via the real installations endpoint.
        for (const installation of githubInstallations) {
          const res = await fetch('/api/github/installations', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
            credentials: 'include',
            body: JSON.stringify({ installationId: installation.installation_id }),
          });
          if (!res.ok) {
            throw new Error('Could not disconnect GitHub. Try again.');
          }
        }
        setGithubInstallations([]);
        return;
      }
      if (id.startsWith('custom-')) {
        const rowId = id.slice('custom-'.length);
        const res = await fetch(`/api/connectors/custom?id=${encodeURIComponent(rowId)}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken },
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Could not remove this connector. Try again.');
        }
        setCustomConnectors((prev) => prev.filter((c) => c.id !== rowId));
        return;
      }
      const res = await fetch(`/api/connectors?connectorId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Could not disconnect. Try again.');
      }
      setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
    },
    [githubInstallations],
  );

  // ── Skills state ───────────────────────────────────────────────────────────

  const [skills, setSkills] = useState<SettingsSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  useEffect(() => {
    if (!open || !['connectors', 'skills', 'plugins'].includes(activeSection)) return;
    if (skills.length > 0) return;
    let cancelled = false;
    setSkillsLoading(true);
    fetch('/api/skills')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { skills: ApiSkill[] };
        if (!cancelled) {
          setSkills(
            (json.skills ?? []).map((s) => ({
              id: s.name,
              name: s.name,
              description: s.description ?? '',
              source: s.source,
              tab: s.source === 'builtin' ? 'prompts' : 'agents',
            })),
          );
        }
      })
      .catch(() => {
        /* degrade gracefully */
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeSection, skills.length]);

  // ── Data adapter ───────────────────────────────────────────────────────────

  // Custom remote-MCP connectors: persisted via POST /api/connectors/custom
  // (live connect-and-list + encrypted-at-rest bearer token — see
  // lib/user-connector-tools.ts). Bearer-token auth only; OAuth
  // client-credentials aren't supported yet, so the form no longer collects
  // them (the dead Advanced-settings OAuth fields were removed).
  const addCustomConnector = useCallback(
    async (input: { name: string; url: string; authToken?: string }) => {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        credentials: 'include',
        body: JSON.stringify({
          name: input.name,
          url: input.url,
          ...(input.authToken ? { authToken: input.authToken } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not add connector. Try again.');
      }
      await refreshCustomConnectors();
    },
    [refreshCustomConnectors],
  );

  // Attention badge on the Connectors nav row, so an expired grant is visible
  // from any settings tab rather than only from inside Connectors.
  const navBadges = useMemo(
    () =>
      expiredConnectorIds.length > 0
        ? {
            connectors: {
              count: expiredConnectorIds.length,
              description:
                expiredConnectorIds.length === 1
                  ? '1 connector needs to be reconnected'
                  : `${expiredConnectorIds.length} connectors need to be reconnected`,
            },
          }
        : undefined,
    [expiredConnectorIds],
  );

  const adapter: SettingsDataAdapter = {
    connectors: mergedSettingsConnectors,
    connectedConnectors: mergedConnectedConnectors,
    connectConnector,
    disconnectConnector,
    addCustomConnector,
    customConnectorAuthTokenSupported: true,
    skills,
    skillsLoading,
    plugins: [],
    pluginsLoading: false,
    pluginCatalog: SETTINGS_PLUGIN_CATALOG,
  };

  // ── Section content map ────────────────────────────────────────────────────
  // Each value is the real wired Section component — NOT the route stub pages.

  const sectionContent: Partial<Record<string, React.ReactNode>> = {
    general: <GeneralSection />,
    account: <AccountSection />,
    // Team administration (members, roles) and the organization's SHARED
    // ecosystem (0086) are the same job to the person doing it: "who is in my
    // org, and what do they get". They render in one section rather than
    // behind a second nav entry, which would also mean changing the shared
    // `SETTINGS_NAV_GROUPS_WEB` contract that the desktop settings-IA test pins.
    team: (
      <div style={{ display: 'grid', gap: 16 }}>
        <TeamSection />
        <OrganizationSharingSection />
      </div>
    ),
    security: <SecuritySection />,
    safety: <SafetySection />,
    privacy: <PrivacySection />,
    archived: <ArchivedChatsSection />,
    'deleted-chats': <DeletedChatsSection />,
    'shared-links': <SharedLinksSection />,
    billing: <BillingSection />,
    usage: <UsageSection />,
    capabilities: <CapabilitiesSection />,
    memory: <MemorySection />,
    notifications: <NotificationsSection />,
    reflect: <ReflectSection />,
    'time-focus': <TimeFocusSection />,
    help: <HelpSection />,
    // connectors / skills / plugins fall through to adapter-driven built-in panels
  };

  return (
    <Suspense fallback={<SectionSkeleton />}>
      <SettingsModal
        open={open}
        onClose={onClose}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        sectionContent={sectionContent}
        navGroups={SETTINGS_NAV_GROUPS_WEB}
        adapter={adapter}
        connectorDisclosure={<ConnectorConsentSummary />}
        navBadges={navBadges}
        title="Settings"
      />
    </Suspense>
  );
}
