/**
 * DesktopCloudSettingsModal
 *
 * Renders the shared @agiworkforce/ui SettingsModal shell for desktop CLOUD mode.
 * Pattern mirrors apps/web/features/settings/components/WebSettingsModal.tsx:
 *   - sectionContent maps section keys → existing desktop tab components (fully wired, IPC/store-backed)
 *   - A DesktopSettingsDataAdapter bridges connectorsStore + skillMarketplaceStore into the
 *     SettingsDataAdapter contract, so the shared Connectors/Skills/Plugins panels render
 *     with real desktop data and connect/disconnect actions.
 *
 * LOCAL mode: NOT used here. App.tsx continues to render SettingsPanel for local mode.
 * CLOUD mode: App.tsx swaps in this component so web + desktop share the same modal shell.
 *
 * Section coverage:
 *   general      → GeneralTab (theme, hotkey, onboarding restart)
 *   account      → AccountTab (cloud account, usage dashboard, team)
 *   privacy      → PrivacyTab (master password, data export, crash reporting, governance)
 *   memory       → MemoryTab  (MemoryEditor from unified-chat)
 *   connectors   → built-in ConnectorsPanel (adapter-driven from connectorsStore)
 *   skills       → built-in SkillsPanel    (adapter-driven from skillMarketplaceStore)
 *   plugins      → built-in PluginsPanel   (adapter-driven from skillMarketplaceStore)
 *   billing      → DesktopBillingSection   (minimal wired panel — see below)
 *   usage        → DesktopUsageSection     (wraps existing UsageDashboard)
 *   capabilities → DesktopCapabilitiesSection (feature flags + agent mode knobs)
 *
 * Deferred: appearance/notifications/voice/models-keys are local-mode-specific and not shown
 * in the cloud modal nav (they stay in SettingsPanel for local users). The activeKeys prop
 * trims the shared nav accordingly.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SettingsModal } from '@agiworkforce/ui';
import type { SettingsDataAdapter, SettingsSkill, SettingsConnector } from '@agiworkforce/ui';

import { CONNECTORS } from '../connectors/connectorDefinitions';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { useSkillMarketplaceStore } from '../../stores/skillMarketplaceStore';
import {
  createDefaultWindowPreferences,
  getDefaultGlobalHotkeyCombo,
  useSettingsStore,
  type Language,
  type GlobalHotkeyPreferences,
} from '../../stores/settingsStore';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import type { SettingsTab } from '../../stores/settingsDialogStore';
import { LEGACY_TAB_MAP } from '../../stores/settingsDialogStore';
import { useShallow } from 'zustand/react/shallow';

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
const LazyUsageDashboard = lazy(() =>
  import('./UsageDashboard').then((m) => ({ default: m.UsageDashboard })),
);

// ── Cloud-only sections that have no dedicated desktop tab ────────────────────

/** Minimal Billing section: proxies into the existing PlansModal via a chat:action event */
function DesktopBillingSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription, payment method, and top-ups.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-5">
        <p className="text-sm text-muted-foreground mb-4">
          Billing and subscription management is handled through the Plans modal.
        </p>
        <button
          type="button"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('chat:action', { detail: { type: 'open-plans-modal' } }),
            )
          }
        >
          Open Plans &amp; Billing
        </button>
      </div>
    </div>
  );
}

/** Usage section: wraps the existing wired UsageDashboard */
function DesktopUsageSection() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Token budget, model usage breakdown, and cost tracking.
        </p>
      </div>
      <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted/40" />}>
        <LazyUsageDashboard />
      </Suspense>
    </div>
  );
}

/** Capabilities section: agent mode toggle and auto-approve controls */
function DesktopCapabilitiesSection() {
  // alwaysUseAgentMode and autoApproveTools live on chatPreferences (not executionPreferences)
  const alwaysUseAgentMode = useSettingsStore(
    (s) => s.chatPreferences?.alwaysUseAgentMode ?? false,
  );
  const autoApproveTools = useSettingsStore((s) => s.chatPreferences?.autoApproveTools ?? false);
  const setAlwaysUseAgentMode = useSettingsStore((s) => s.setAlwaysUseAgentMode);
  const setAutoApproveTools = useSettingsStore((s) => s.setAutoApproveTools);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Capabilities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Agent mode controls and execution preferences.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-5 flex flex-col gap-5">
        {/* Agent mode toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Always use Agent Mode</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Automatically enables multi-step agentic execution for every conversation.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={alwaysUseAgentMode}
            onClick={() => setAlwaysUseAgentMode(!alwaysUseAgentMode)}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              alwaysUseAgentMode ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform ${
                alwaysUseAgentMode ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>

        <div className="border-t border-border/60" />

        {/* Auto-approve tools toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">AGI Mode (Auto-approve all tools)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Bypasses per-tool approval gates. Use only in trusted environments. Opt-in; default is
              fail-closed approval.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoApproveTools}
            onClick={() => setAutoApproveTools(!autoApproveTools)}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              autoApproveTools ? 'bg-amber-500' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform ${
                autoApproveTools ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton shown while a section is hydrating ───────────────────────────────

function SectionSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-5 w-40 rounded bg-muted/30" />
      <div className="h-4 w-72 rounded bg-muted/20" />
      <div className="h-36 w-full rounded-xl bg-muted/20" />
    </div>
  );
}

// ── Color map for desktop ConnectorDef → shared SettingsConnector iconBg ─────

const COLOR_TO_GRADIENT: Record<string, string> = {
  red: 'from-red-500 to-red-600',
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  purple: 'from-purple-500 to-purple-600',
  orange: 'from-orange-500 to-orange-600',
  yellow: 'from-yellow-500 to-yellow-600',
  gray: 'from-gray-500 to-gray-600',
  pink: 'from-pink-500 to-pink-600',
  indigo: 'from-indigo-500 to-indigo-600',
  teal: 'from-teal-500 to-teal-600',
  cyan: 'from-cyan-500 to-cyan-600',
};

/** Map desktop's ConnectorDef[] → shared SettingsConnector[] */
const DESKTOP_SETTINGS_CONNECTORS: SettingsConnector[] = CONNECTORS.map((c, idx) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  category: c.category,
  authType: c.authType,
  // actionCount used as rough popularity rank; comingSoon connectors get 0
  actionCount: c.comingSoon ? 0 : Math.max(0, CONNECTORS.length - idx),
  // comingSoon → phase 2 so the shared shell renders "Soon"
  phase: c.comingSoon ? 2 : 1,
  iconBg: COLOR_TO_GRADIENT[c.color] ?? 'from-gray-500 to-gray-600',
  iconText: c.name.slice(0, 2).toUpperCase(),
}));

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
  // ── Resolve initial section from legacy tab map ──────────────────────────
  const resolveSection = (tab: SettingsTab): string => {
    const mapped = (LEGACY_TAB_MAP[tab] ?? tab) as string;
    // Cloud modal only shows these sections; fall back to general for anything else
    const CLOUD_SECTIONS = new Set([
      'general',
      'account',
      'privacy',
      'billing',
      'usage',
      'capabilities',
      'connectors',
      'skills',
      'plugins',
      'memory',
    ]);
    return CLOUD_SECTIONS.has(mapped) ? mapped : 'general';
  };

  const [activeSection, setActiveSection] = useState<string>(() => resolveSection(initialTab));

  // Sync when the dialog is re-opened with a different tab
  useEffect(() => {
    if (open) setActiveSection(resolveSection(initialTab));
  }, [open, initialTab]);

  // ── Connected connectors (from desktop connectorsStore) ──────────────────
  const connectedIds = useConnectorsStore((s) => s.connectedIds);
  const connectorConnect = useConnectorsStore((s) => s.connect);
  const connectorDisconnect = useConnectorsStore((s) => s.disconnect);

  const connectedConnectors = useMemo(
    () => connectedIds.map((id) => ({ connectorId: id })),
    [connectedIds],
  );

  const connectConnector = useCallback(
    async (id: string) => {
      await connectorConnect(id);
    },
    [connectorConnect],
  );

  const disconnectConnector = useCallback(
    async (id: string) => {
      await connectorDisconnect(id);
    },
    [connectorDisconnect],
  );

  // ── Skills (from skillMarketplaceStore) ──────────────────────────────────
  const marketplaceSkills = useSkillMarketplaceStore((s) => s.skills);
  const skillsLoading = useSkillMarketplaceStore((s) => s.isLoading);
  const hasSkillsLoaded = useSkillMarketplaceStore((s) => s.hasLoaded);
  const fetchSkills = useSkillMarketplaceStore((s) => s.fetchSkills);

  useEffect(() => {
    if (open && activeSection === 'skills' && !hasSkillsLoaded && !skillsLoading) {
      void fetchSkills();
    }
  }, [open, activeSection, hasSkillsLoaded, skillsLoading, fetchSkills]);

  const skills: SettingsSkill[] = useMemo(
    () =>
      marketplaceSkills.map((s) => ({
        id: s.name,
        name: s.name,
        description: s.description,
        source: s.sourceType,
        tab: (s.sourceType === 'builtin' ? 'prompts' : 'agents') as 'prompts' | 'agents',
      })),
    [marketplaceSkills],
  );

  // ── Data adapter ─────────────────────────────────────────────────────────
  const adapter: SettingsDataAdapter = useMemo(
    () => ({
      connectors: DESKTOP_SETTINGS_CONNECTORS,
      connectedConnectors,
      connectConnector,
      disconnectConnector,
      skills,
      skillsLoading,
      // Plugins surface in desktop comes from the skill engine; no separate plugin store yet.
      // Return empty list so the shared PluginsPanel shows the "install via CLI" empty state.
      plugins: [],
      pluginsLoading: false,
    }),
    [connectedConnectors, connectConnector, disconnectConnector, skills, skillsLoading],
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

  // ── Governance workspace opener (for PrivacyTab) ─────────────────────────
  const openGovernanceWorkspace = useCallback(() => {
    onClose();
    useUnifiedChatStore.getState().openSidecar('governance');
  }, [onClose]);

  // ── Auto-save general settings when section changes away from general ─────
  const prevSectionRef = useRef(activeSection);
  useEffect(() => {
    if (prevSectionRef.current === 'general' && activeSection !== 'general') {
      void saveSettings().catch(() => {
        // Non-fatal; settings will be saved on next explicit save
      });
    }
    prevSectionRef.current = activeSection;
  }, [activeSection, saveSettings]);

  // ── Section content map ──────────────────────────────────────────────────
  const sectionContent: Partial<Record<string, React.ReactNode>> = useMemo(
    () => ({
      general: (
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
      ),
      account: (
        <Suspense fallback={<SectionSkeleton />}>
          <LazyAccountTab />
        </Suspense>
      ),
      privacy: (
        <Suspense fallback={<SectionSkeleton />}>
          <LazyPrivacyTab onOpenGovernanceWorkspace={openGovernanceWorkspace} />
        </Suspense>
      ),
      billing: <DesktopBillingSection />,
      usage: <DesktopUsageSection />,
      capabilities: <DesktopCapabilitiesSection />,
      memory: (
        <Suspense fallback={<SectionSkeleton />}>
          <LazyMemoryTab />
        </Suspense>
      ),
      // connectors / skills / plugins fall through to adapter-driven built-in panels
    }),

    [
      resolvedWindowPreferences,
      resolvedGlobalHotkeyPreferences,
      defaultGlobalHotkeyCombo,
      openGovernanceWorkspace,
      setTheme,
      setLanguage,
      setGlobalHotkeyEnabled,
      setGlobalHotkeyCombo,
    ],
  );

  // ── Nav keys visible in the cloud modal ─────────────────────────────────
  const activeKeys = [
    'general',
    'account',
    'privacy',
    'billing',
    'usage',
    'capabilities',
    'connectors',
    'skills',
    'plugins',
    'memory',
  ];

  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      sectionContent={sectionContent}
      activeKeys={activeKeys}
      adapter={adapter}
      title="Settings"
    />
  );
}
