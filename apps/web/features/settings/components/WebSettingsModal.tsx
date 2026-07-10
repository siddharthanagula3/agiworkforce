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
 *   account      -> AccountSection  (sessions, org ID, logout)
 *   security     -> SecuritySection (2FA, session timeout, change password)
 *   privacy      -> PrivacySection  (toggles, export, delete)
 *   billing      -> BillingSection  (plan, payment, invoices)
 *   usage        -> UsageSection    (credit bars, analytics)
 *   capabilities -> CapabilitiesSection (memory, tools, artifacts)
 *   memory       -> MemorySection   (MemoryEditor)
 *   notifications -> NotificationsSection (browser/email/mobile-push toggles)
 *   connectors   -> ConnectorsPanel (built-in to shared shell via adapter)
 *   skills       -> SkillsPanel     (built-in to shared shell via adapter)
 *   plugins      -> PluginsPanel    (built-in to shared shell via adapter)
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SettingsModal, SETTINGS_NAV_GROUPS_WEB } from '@agiworkforce/ui';
import type { SettingsDataAdapter, SettingsSkill } from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { getCsrfToken } from '@/lib/client/csrf';

// Section components — real wired content, NOT route stubs
import { GeneralSection } from '../sections/GeneralSection';
import { AccountSection } from '../sections/AccountSection';
import { SecuritySection } from '../sections/SecuritySection';
import { PrivacySection } from '../sections/PrivacySection';
import { BillingSection } from '../sections/BillingSection';
import { UsageSection } from '../sections/UsageSection';
import { CapabilitiesSection } from '../sections/CapabilitiesSection';
import { MemorySection } from '../sections/MemorySection';
import { NotificationsSection } from '../sections/NotificationsSection';

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
  security: 'security',
  privacy: 'privacy',
  billing: 'billing',
  usage: 'usage',
  capabilities: 'capabilities',
  connectors: 'connectors',
  skills: 'skills',
  plugins: 'plugins',
  memory: 'memory',
  notifications: 'notifications',
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
  // Two REAL sources (no optimistic fakery):
  //   1. Active user_connectors rows (GET /api/connectors) — the per-user
  //      enablement gate.
  //   2. GitHub App installations (GET /api/github/installations) — GitHub
  //      cannot have a user_connectors row (known-flaws WEB-CONNECTORS row);
  //      the installation IS the real "connected" signal, matching what the
  //      chat tool loop actually offers.

  const [connectedConnectors, setConnectedConnectors] = useState<
    { connectorId: string; connectedAt?: string }[]
  >([]);
  const [githubInstallations, setGithubInstallations] = useState<
    { installation_id: number; created_at?: string }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/connectors', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          connectors: Array<{ connectorId: string; connectedAt?: string }>;
        };
        if (!cancelled) setConnectedConnectors(json.connectors ?? []);
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
    return () => {
      cancelled = true;
    };
  }, [open]);

  const mergedConnectedConnectors = useMemo(() => {
    const rows = connectedConnectors.filter((c) => c.connectorId !== 'github');
    if (githubInstallations.length > 0) {
      rows.push({ connectorId: 'github', connectedAt: githubInstallations[0]?.created_at });
    }
    return rows;
  }, [connectedConnectors, githubInstallations]);

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
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
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
    if (!open || activeSection !== 'skills') return;
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

  // Custom remote-MCP connectors have NO web persistence today:
  // /api/connectors allowlists catalog IDs (arbitrary IDs are rejected) and
  // remote-MCP endpoints are operator-configured server-side (known-flaws
  // WEB-CONNECTORS row). The form renders per spec, but submitting must be
  // honest — throw so the shared form surfaces the message, never a fake
  // success.
  const addCustomConnector = useCallback(async () => {
    throw new Error(
      'Custom connectors are not yet supported on web. Remote MCP servers are configured by the operator today.',
    );
  }, []);

  const adapter: SettingsDataAdapter = {
    connectors: SETTINGS_CONNECTORS,
    connectedConnectors: mergedConnectedConnectors,
    connectConnector,
    disconnectConnector,
    addCustomConnector,
    skills,
    skillsLoading,
    plugins: [],
    pluginsLoading: false,
  };

  // ── Section content map ────────────────────────────────────────────────────
  // Each value is the real wired Section component — NOT the route stub pages.

  const sectionContent: Partial<Record<string, React.ReactNode>> = {
    general: <GeneralSection />,
    account: <AccountSection />,
    security: <SecuritySection />,
    privacy: <PrivacySection />,
    billing: <BillingSection />,
    usage: <UsageSection />,
    capabilities: <CapabilitiesSection />,
    memory: <MemorySection />,
    notifications: <NotificationsSection />,
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
        title="Settings"
      />
    </Suspense>
  );
}
