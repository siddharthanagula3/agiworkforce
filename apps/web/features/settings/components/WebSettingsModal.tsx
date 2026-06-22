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
 *   privacy      -> PrivacySection  (toggles, export, delete)
 *   billing      -> BillingSection  (plan, payment, invoices)
 *   usage        -> UsageSection    (credit bars, analytics)
 *   capabilities -> CapabilitiesSection (memory, tools, artifacts)
 *   memory       -> MemorySection   (MemoryEditor)
 *   connectors   -> ConnectorsPanel (built-in to shared shell via adapter)
 *   skills       -> SkillsPanel     (built-in to shared shell via adapter)
 *   plugins      -> PluginsPanel    (built-in to shared shell via adapter)
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SettingsModal } from '@agiworkforce/ui';
import type { SettingsDataAdapter, SettingsSkill } from '@agiworkforce/ui';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { getCsrfToken } from '@/lib/client/csrf';

// Section components — real wired content, NOT route stubs
import { GeneralSection } from '../sections/GeneralSection';
import { AccountSection } from '../sections/AccountSection';
import { PrivacySection } from '../sections/PrivacySection';
import { BillingSection } from '../sections/BillingSection';
import { UsageSection } from '../sections/UsageSection';
import { CapabilitiesSection } from '../sections/CapabilitiesSection';
import { MemorySection } from '../sections/MemorySection';

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
  privacy: 'privacy',
  billing: 'billing',
  usage: 'usage',
  capabilities: 'capabilities',
  connectors: 'connectors',
  skills: 'skills',
  plugins: 'plugins',
  memory: 'memory',
};

const SEGMENT_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTION_TO_SEGMENT).map(([k, v]) => [v, k]),
);

// ---------------------------------------------------------------------------
// Connector catalog -> SettingsConnector shape
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

  const [connectedConnectors, setConnectedConnectors] = useState<
    { connectorId: string; connectedAt?: string }[]
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
    return () => {
      cancelled = true;
    };
  }, [open]);

  const connectConnector = useCallback(async (id: string) => {
    const connector = SETTINGS_CONNECTORS.find((c) => c.id === id);
    if (!connector) return;
    setConnectedConnectors((prev) => [
      ...prev,
      { connectorId: id, connectedAt: new Date().toISOString() },
    ]);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ connectorId: id, authType: connector.authType }),
      });
      if (!res.ok) {
        setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
      }
    } catch {
      setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
    }
  }, []);

  const disconnectConnector = useCallback(async (id: string) => {
    setConnectedConnectors((prev) => prev.filter((c) => c.connectorId !== id));
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/connectors?connectorId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken },
        credentials: 'include',
      });
      if (!res.ok) {
        const refetch = await fetch('/api/connectors', { credentials: 'include' });
        if (refetch.ok) {
          const json = (await refetch.json()) as {
            connectors: Array<{ connectorId: string; connectedAt?: string }>;
          };
          setConnectedConnectors(json.connectors ?? []);
        }
      }
    } catch {
      // leave optimistic state
    }
  }, []);

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

  const adapter: SettingsDataAdapter = {
    connectors: SETTINGS_CONNECTORS,
    connectedConnectors,
    connectConnector,
    disconnectConnector,
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
    privacy: <PrivacySection />,
    billing: <BillingSection />,
    usage: <UsageSection />,
    capabilities: <CapabilitiesSection />,
    memory: <MemorySection />,
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
        adapter={adapter}
        title="Settings"
      />
    </Suspense>
  );
}
