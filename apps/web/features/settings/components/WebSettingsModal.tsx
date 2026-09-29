'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import {
  confirmNavigation,
  SettingsModal,
  SETTINGS_NAV_GROUP_CUSTOMIZE,
  SETTINGS_NAV_GROUP_DESKTOP,
  SETTINGS_NAV_GROUP_SETTINGS,
} from '@agiworkforce/ui';
import type { SettingsDataAdapter, SettingsNavGroupResolved } from '@agiworkforce/ui';
import {
  buildSettingsCustomConnectorHash,
  buildSettingsHash,
  parseSettingsHash,
  replaceSettingsHash,
  settingsHashForSection,
} from '@/features/directory';
import { ToolPermissionsPanel } from '@/features/connectors/components/ToolPermissionsPanel';
import { useConnectorsSettingsAdapter } from '@/features/connectors/hooks/use-connectors-settings-adapter';
import { useSkillsSettingsAdapter } from '@/features/skills/hooks/use-skills-settings-adapter';
import type {
  WebSettingsContentSection,
  WebSettingsHostedSection,
} from '../lib/web-settings-sections';
import { DesktopSettingsSection, useDesktopHost } from '@/features/desktop-host';

import { GeneralSection } from '../sections/GeneralSection';
import { AccountSection } from '../sections/AccountSection';
import { TeamSection } from '../sections/TeamSection';
import { WorkspaceConsolePointer } from '../sections/WorkspaceConsolePointer';
import { SecuritySection } from '../sections/SecuritySection';
import { SafetySection } from '../sections/SafetySection';
import { PrivacySection } from '../sections/PrivacySection';
import { ArchivedChatsSection } from '../sections/ArchivedChatsSection';
import { DeletedChatsSection } from '../sections/DeletedChatsSection';
import { SharedLinksSection } from '../sections/SharedLinksSection';
import { BillingSection } from '../sections/BillingSection';
import { UsageSection } from '../sections/UsageSection';
import { ReferralsSection } from '../sections/ReferralsSection';
import { CapabilitiesSection } from '../sections/CapabilitiesSection';
import { MemorySection } from '../sections/MemorySection';
import { NotificationsSection } from '../sections/NotificationsSection';
import { VoiceSection } from '../sections/VoiceSection';
import { ReflectSection } from '../sections/ReflectSection';
import { TimeFocusSection } from '../sections/TimeFocusSection';
import { HelpSection } from '../sections/HelpSection';
import { SlackSection } from '../sections/SlackSection';
import { SettingsSectionNavigationProvider } from './SettingsSectionLink';
import { CapabilityDeniedNotice } from './CapabilityDeniedNotice';
import { useCapabilityDecision } from '@agiworkforce/unified-chat';
import { loadOnboardingSeed } from '@/features/onboarding/lib/onboarding-preferences';
import {
  HOSTED_SETTINGS_NAV_GROUPS,
  WEB_SETTINGS_NAV_GROUPS,
  settingsSectionFromPath,
} from './web-settings-navigation';
import { SkillEditorDialog } from '@features/skills/components/SkillEditorDialog';

export { SETTINGS_CONNECTORS } from '@/features/connectors/hooks/use-connectors-settings-adapter';

// ---------------------------------------------------------------------------
// Skeleton shown while a section is still hydrating
// ---------------------------------------------------------------------------

function SectionSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-6 w-48 rounded-compact bg-foreground/10" />
      <div className="h-4 w-80 rounded-compact bg-foreground/[0.07]" />
      <div className="h-40 w-full rounded-xl bg-foreground/[0.07]" />
    </div>
  );
}

const SETTINGS_SECTION_CONNECTORS = 'connectors';

const NAV_GROUP_LABEL_KEYS: Record<string, string> = {
  [SETTINGS_NAV_GROUP_SETTINGS]: 'nav.groupSettings',
  [SETTINGS_NAV_GROUP_CUSTOMIZE]: 'nav.groupCustomize',
  [SETTINGS_NAV_GROUP_DESKTOP]: 'nav.groupDesktop',
};

function translateNavGroups(
  groups: SettingsNavGroupResolved[],
  t: (key: string, options: { defaultValue: string }) => string,
): SettingsNavGroupResolved[] {
  return groups.map((group) => ({
    ...group,
    ...(group.label
      ? {
          label: t(NAV_GROUP_LABEL_KEYS[group.label] ?? group.label, { defaultValue: group.label }),
        }
      : {}),
    items: group.items.map((item) => ({
      ...item,
      label: t(`nav.${item.key}`, { defaultValue: item.label }),
    })),
  }));
}

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
  const pathname = usePathname();
  const host = useDesktopHost();
  const { t } = useTranslation('settings');
  const navGroups = useMemo(
    () => translateNavGroups(host ? HOSTED_SETTINGS_NAV_GROUPS : WEB_SETTINGS_NAV_GROUPS, t),
    [host, t],
  );

  const sectionFromPath = settingsSectionFromPath(pathname);

  const [activeSection, setActiveSection] = useState<string>(sectionFromPath ?? initialSection);

  useEffect(() => {
    if (sectionFromPath) {
      setActiveSection(sectionFromPath);
    } else if (open) {
      setActiveSection(initialSection);
    }
  }, [open, initialSection, sectionFromPath]);

  const handleSectionChange = useCallback((key: string) => {
    setActiveSection(key);
    const next = settingsHashForSection(key, window.location.hash);
    if (next !== null) replaceSettingsHash(next);
  }, []);

  const handleSectionLink = useCallback(
    (key: string) => confirmNavigation(() => handleSectionChange(key)),
    [handleSectionChange],
  );

  const [customConnectorOpen, setCustomConnectorOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const route = parseSettingsHash(window.location.hash);
      setCustomConnectorOpen(route?.section === SETTINGS_SECTION_CONNECTORS && route.custom);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const handleCustomConnectorOpenChange = useCallback((next: boolean) => {
    setCustomConnectorOpen(next);
    const hash = next
      ? buildSettingsCustomConnectorHash()
      : buildSettingsHash(SETTINGS_SECTION_CONNECTORS);
    if (hash && window.location.hash !== hash) replaceSettingsHash(hash);
  }, []);

  // The `__session` cookie is a short-lived JWT that only a document request
  // can refresh through Clerk's handshake redirect. A fetch that relies on it
  // alone starts 401ing as soon as it goes stale, so mint a fresh token the
  // way the chat sync client does and send it explicitly.
  const { getToken } = useSession();
  const authedHeaders = useCallback(
    async (base?: Record<string, string>): Promise<Record<string, string>> => {
      const token = await getToken();
      return { ...base, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    },
    [getToken],
  );

  const skills = useSkillsSettingsAdapter({ open, activeSection, authedHeaders });
  const openCustomConnector = useCallback(
    () => handleCustomConnectorOpenChange(true),
    [handleCustomConnectorOpenChange],
  );
  const connectors = useConnectorsSettingsAdapter({
    open,
    authedHeaders,
    onOpenCustomConnector: openCustomConnector,
    directorySkillActions: skills.directorySkillActions,
  });
  const { clearCustomConnectorPreset } = connectors;
  const changeCustomConnectorOpen = useCallback(
    (next: boolean) => {
      clearCustomConnectorPreset();
      handleCustomConnectorOpenChange(next);
    },
    [clearCustomConnectorPreset, handleCustomConnectorOpenChange],
  );

  const adapter: SettingsDataAdapter = connectors.adapter;
  const skillsDecision = useCapabilityDecision('canUseSkills');
  const pluginsDecision = useCapabilityDecision('canUsePlugins');

  const sectionContent: Record<WebSettingsContentSection, React.ReactNode> &
    Partial<Record<WebSettingsHostedSection | 'skills' | 'plugins', React.ReactNode>> = {
    ...(host ? { desktop: <DesktopSettingsSection /> } : {}),
    ...(skillsDecision?.allowed === false && skillsDecision.reason
      ? { skills: <CapabilityDeniedNotice reason={skillsDecision.reason} /> }
      : {}),
    ...(pluginsDecision?.allowed === false && pluginsDecision.reason
      ? { plugins: <CapabilityDeniedNotice reason={pluginsDecision.reason} /> }
      : {}),
    general: <GeneralSection />,
    account: <AccountSection />,
    team: (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <WorkspaceConsolePointer />
        <TeamSection />
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
    referrals: <ReferralsSection />,
    capabilities: <CapabilitiesSection />,
    memory: <MemorySection />,
    notifications: <NotificationsSection />,
    voice: <VoiceSection />,
    reflect: <ReflectSection />,
    'time-focus': <TimeFocusSection />,
    slack: <SlackSection />,
    help: <HelpSection />,
    // connectors / skills / plugins fall through to adapter-driven built-in panels
  };

  const [workRole, setWorkRole] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadOnboardingSeed()
      .then((seed) => {
        if (!cancelled) setWorkRole(seed.workDescription || null);
      })
      .catch(() => {
        if (!cancelled) setWorkRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Suspense fallback={<SectionSkeleton />}>
      <SettingsSectionNavigationProvider onNavigate={handleSectionLink} onExit={onClose}>
        <SettingsModal
          open={open}
          onClose={onClose}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          sectionContent={sectionContent}
          navGroups={navGroups}
          adapter={adapter}
          directoryAdapter={connectors.directoryAdapter}
          navBadges={connectors.navBadges}
          openCustomConnector={customConnectorOpen}
          onCustomConnectorOpenChange={changeCustomConnectorOpen}
          workRole={workRole}
        />
        <ToolPermissionsPanel
          connector={connectors.toolPermissionsConnector}
          open={connectors.toolPermissionsConnector !== null}
          onOpenChange={(next) => {
            if (!next) connectors.setToolPermissionsConnectorId(null);
          }}
        />
        <SkillEditorDialog {...skills.skillEditorProps} />
      </SettingsSectionNavigationProvider>
    </Suspense>
  );
}
