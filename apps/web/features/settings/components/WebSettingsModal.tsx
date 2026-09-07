'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import { Brain, Mic } from 'lucide-react';
import {
  SettingsModal,
  SETTINGS_NAV_GROUPS_WEB,
  SETTINGS_NAV_GROUP_CUSTOMIZE,
} from '@agiworkforce/ui';
import type {
  SettingsDataAdapter,
  SettingsNavGroupResolved,
  SettingsNavItem,
} from '@agiworkforce/ui';
import { replaceSettingsHash, settingsHashForSection } from '@/features/directory';
import { ToolPermissionsPanel } from '@/features/connectors/components/ToolPermissionsPanel';
import { useConnectorsSettingsAdapter } from '@/features/connectors/hooks/use-connectors-settings-adapter';
import { useSkillsSettingsAdapter } from '@/features/skills/hooks/use-skills-settings-adapter';
import type { WebSettingsContentSection } from '../lib/web-settings-sections';

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
import { CapabilitiesSection } from '../sections/CapabilitiesSection';
import { MemorySection } from '../sections/MemorySection';
import { NotificationsSection } from '../sections/NotificationsSection';
import { VoiceSection } from '../sections/VoiceSection';
import { ReflectSection } from '../sections/ReflectSection';
import { TimeFocusSection } from '../sections/TimeFocusSection';
import { HelpSection } from '../sections/HelpSection';
import { SettingsSectionNavigationProvider } from './SettingsSectionLink';
import { SkillEditorDialog } from '@features/skills/components/SkillEditorDialog';

export { SETTINGS_CONNECTORS } from '@/features/connectors/hooks/use-connectors-settings-adapter';

// ---------------------------------------------------------------------------
// Skeleton shown while a section is still hydrating
// ---------------------------------------------------------------------------

function SectionSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="h-6 w-48 rounded bg-foreground/10" />
      <div className="h-4 w-80 rounded bg-foreground/[0.07]" />
      <div className="h-40 w-full rounded-xl bg-foreground/[0.07]" />
    </div>
  );
}

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
  voice: 'voice',
  reflect: 'reflect',
  'time-focus': 'time-focus',
  help: 'help',
};

const SEGMENT_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(SECTION_TO_SEGMENT).map(([k, v]) => [v, k]),
);

const MEMORY_NAV_ITEM: SettingsNavItem = {
  key: 'memory',
  label: 'Memory',
  icon: Brain,
  keywords: ['facts', 'remember', 'personalization', 'manage memories'],
};

const VOICE_NAV_ITEM: SettingsNavItem = {
  key: 'voice',
  label: 'Voice',
  icon: Mic,
  keywords: ['speech', 'tts', 'microphone', 'audio', 'dictation'],
};

const VOICE_NAV_ANCHOR = 'notifications';

const WEB_SETTINGS_NAV_GROUPS: SettingsNavGroupResolved[] = SETTINGS_NAV_GROUPS_WEB.map((group) =>
  group.label === SETTINGS_NAV_GROUP_CUSTOMIZE
    ? { ...group, items: [...group.items, MEMORY_NAV_ITEM] }
    : {
        ...group,
        items: group.items.flatMap((item) =>
          item.key === VOICE_NAV_ANCHOR ? [item, VOICE_NAV_ITEM] : [item],
        ),
      },
);

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
  const connectors = useConnectorsSettingsAdapter({
    open,
    authedHeaders,
    directorySkillActions: skills.directorySkillActions,
  });

  const adapter: SettingsDataAdapter = connectors.adapter;

  const sectionContent: Record<WebSettingsContentSection, React.ReactNode> = {
    general: <GeneralSection />,
    account: <AccountSection />,
    team: (
      <div style={{ display: 'grid', gap: 16 }}>
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
    capabilities: <CapabilitiesSection />,
    memory: <MemorySection />,
    notifications: <NotificationsSection />,
    voice: <VoiceSection />,
    reflect: <ReflectSection />,
    'time-focus': <TimeFocusSection />,
    help: <HelpSection />,
    // connectors / skills / plugins fall through to adapter-driven built-in panels
  };

  return (
    <Suspense fallback={<SectionSkeleton />}>
      <SettingsSectionNavigationProvider onNavigate={handleSectionChange} onExit={onClose}>
        <SettingsModal
          open={open}
          onClose={onClose}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
          sectionContent={sectionContent}
          navGroups={WEB_SETTINGS_NAV_GROUPS}
          adapter={adapter}
          directoryAdapter={connectors.directoryAdapter}
          navBadges={connectors.navBadges}
          title="Settings"
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
