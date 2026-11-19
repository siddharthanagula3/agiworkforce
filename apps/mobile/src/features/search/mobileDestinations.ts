import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import type { MobileChatAppMode } from '@/src/features/chat/store/appModeStore';
import { CLOUD_CODE_SCREEN_TITLE } from '@/src/features/cloud-code/presentation';
import { isShownInMode } from '@/src/features/shell/destinationScope';
import {
  NOTIFICATIONS_SCREEN_TITLE,
  SECURITY_LOGIN_SCREEN_TITLE,
  SHARED_LINKS_SCREEN_TITLE,
  SUBSCRIPTION_SCREEN_TITLE,
} from '@/src/features/settings/screenTitles';
import type { MobileGlobalSearchResult } from './mobileGlobalSearch';

export type SettingsHomeSection = 'Account' | 'Device' | 'Assistant' | 'Cloud' | 'Support';

export interface MobileDestination {
  route: string;
  title: string;
  section: string;
  keywords: readonly string[];
  settingsSection?: SettingsHomeSection;
}

export interface SettingsPageSearchResult {
  route: string;
  title: string;
  settingsSection: SettingsHomeSection;
}

export const MOBILE_DESTINATIONS: readonly MobileDestination[] = [
  {
    route: '/(app)/chats',
    title: 'Chats',
    section: 'Go to',
    keywords: ['history', 'conversations'],
  },
  { route: '/(app)/(tabs)/projects', title: 'Projects', section: 'Go to', keywords: ['folders'] },
  {
    route: '/(app)/library',
    title: 'Library',
    section: 'Go to',
    keywords: ['images', 'generated'],
  },
  {
    route: '/(app)/artifacts',
    title: 'Artifacts',
    section: 'Go to',
    keywords: ['documents', 'code'],
  },
  {
    route: '/(app)/schedules',
    title: 'Scheduled tasks',
    section: 'Go to',
    keywords: ['schedules', 'automations', 'recurring'],
  },
  { route: '/(app)/tasks', title: 'Tasks', section: 'Go to', keywords: ['work', 'runs'] },
  {
    route: '/(app)/cloud-code',
    title: `${CLOUD_CODE_SCREEN_TITLE} sessions`,
    section: 'Go to',
    keywords: [
      'code',
      'repository',
      'agi code',
      'remote',
      'computer',
      'pair',
      'desktop',
      'devices',
    ],
  },
  {
    route: '/(app)/connectors',
    title: 'Connectors',
    section: 'Go to',
    keywords: ['integrations', 'apps', 'mcp'],
  },
  { route: '/(app)/skills', title: 'Skills', section: 'Go to', keywords: ['plugins'] },
  {
    route: '/(app)/customize',
    title: 'Customize',
    section: 'Go to',
    keywords: ['skills', 'plugins', 'connectors'],
  },
  {
    route: '/(app)/plugins',
    title: 'Plugins',
    section: 'Go to',
    keywords: ['marketplace', 'extensions'],
  },
  {
    route: '/(app)/agents',
    title: 'Agents',
    section: 'Go to',
    keywords: ['gpts', 'assistants', 'custom'],
  },
  {
    route: '/(app)/sites',
    title: 'Sites',
    section: 'Go to',
    keywords: ['publish', 'published sites', 'artifacts', 'apps'],
  },
  { route: '/(app)/models', title: 'Models', section: 'Go to', keywords: ['model picker'] },
  {
    route: '/(app)/notifications',
    title: 'Notifications',
    section: 'Go to',
    keywords: ['inbox', 'alerts'],
  },
  {
    route: '/(app)/support',
    title: 'Help and support',
    section: 'Go to',
    keywords: ['ticket', 'contact'],
  },
  { route: '/(app)/settings', title: 'Settings', section: 'Settings', keywords: ['preferences'] },
  {
    route: '/(app)/settings/general',
    title: 'General',
    section: 'Settings',
    keywords: ['language', 'startup', 'haptics', 'haptic feedback'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/settings/appearance',
    title: 'Appearance',
    section: 'Settings',
    keywords: ['theme', 'dark mode', 'text size'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/settings/personalization',
    title: 'Personalization',
    section: 'Settings',
    keywords: ['custom instructions', 'name', 'style'],
    settingsSection: 'Assistant',
  },
  {
    route: '/(app)/settings/memory',
    title: 'Memory',
    section: 'Settings',
    keywords: ['remember', 'saved memories', 'forget'],
    settingsSection: 'Assistant',
  },
  {
    route: '/(app)/settings/voice',
    title: 'Voice',
    section: 'Settings',
    keywords: ['speech', 'read aloud', 'dictation', 'voice input', 'microphone'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/settings/voice-language',
    title: 'Voice language',
    section: 'Settings',
    keywords: ['dictation', 'speech language'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/settings/notifications',
    title: NOTIFICATIONS_SCREEN_TITLE,
    section: 'Settings',
    keywords: ['push', 'alerts'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/settings/data-controls',
    title: 'Data controls',
    section: 'Settings',
    keywords: ['export', 'delete', 'delete account', 'training', 'privacy'],
    settingsSection: 'Assistant',
  },
  {
    route: '/(app)/settings/archived-chats',
    title: 'Archived chats',
    section: 'Settings',
    keywords: ['archive'],
    settingsSection: 'Cloud',
  },
  {
    route: '/(app)/settings/shared-links',
    title: SHARED_LINKS_SCREEN_TITLE,
    section: 'Settings',
    keywords: ['share', 'links'],
    settingsSection: 'Account',
  },
  {
    route: '/(app)/settings/capabilities',
    title: 'Capabilities',
    section: 'Settings',
    keywords: ['web search', 'code', 'images', 'tools'],
    settingsSection: 'Assistant',
  },
  {
    route: '/(app)/settings/code',
    title: `${CLOUD_CODE_SCREEN_TITLE} settings`,
    section: 'Settings',
    keywords: [
      'wrap',
      'wrap long lines',
      'wrap lines',
      'long lines',
      'diff',
      'code blocks',
      'coding',
    ],
    settingsSection: 'Assistant',
  },
  {
    route: '/(app)/settings/account-security',
    title: SECURITY_LOGIN_SCREEN_TITLE,
    section: 'Settings',
    keywords: [
      'account security',
      'password',
      'two-factor',
      'mfa',
      'passkey',
      'sessions',
      'sign in',
      'log out',
    ],
    settingsSection: 'Account',
  },
  {
    route: '/(app)/settings/workspace',
    title: 'Workspace',
    section: 'Settings',
    keywords: ['team', 'members', 'roles', 'invite'],
    settingsSection: 'Account',
  },
  {
    route: '/(app)/settings/cloud-billing',
    title: SUBSCRIPTION_SCREEN_TITLE,
    section: 'Settings',
    keywords: NATIVE_PURCHASES_AVAILABLE
      ? ['plan', 'subscription', 'payment', 'credits']
      : ['plan', 'subscription'],
    settingsSection: 'Account',
  },
  {
    route: '/(app)/settings/cloud-usage',
    title: 'Usage',
    section: 'Settings',
    keywords: ['limits', 'credits', 'tokens'],
    settingsSection: 'Cloud',
  },
  {
    route: '/(app)/settings/storage',
    title: 'Storage',
    section: 'Settings',
    keywords: ['cache', 'space'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/settings/parental-controls',
    title: 'Parental controls',
    section: 'Settings',
    keywords: ['family', 'teen', 'age', 'minor'],
    settingsSection: 'Device',
  },
  {
    route: '/(app)/about',
    title: 'About',
    section: 'Settings',
    keywords: ['version', 'legal', 'licenses', 'terms', 'privacy policy'],
    settingsSection: 'Support',
  },
];

function matchingDestinations(query: string, appMode: MobileChatAppMode): MobileDestination[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return MOBILE_DESTINATIONS.filter(
    (destination) =>
      isShownInMode(destination.route, appMode) &&
      (destination.title.toLocaleLowerCase().includes(needle) ||
        destination.keywords.some((keyword) => keyword.includes(needle))),
  );
}

export function searchMobileDestinations(
  query: string,
  appMode: MobileChatAppMode,
): MobileGlobalSearchResult[] {
  return matchingDestinations(query, appMode).map((destination) => ({
    id: destination.route,
    title: destination.title,
    subtitle: destination.section,
    targetId: destination.route,
  }));
}

function matchRank(destination: MobileDestination, needle: string): number {
  const title = destination.title.toLocaleLowerCase();
  if (title.startsWith(needle)) return 0;
  const wholeWord = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}($|[^\\p{L}\\p{N}])`,
    'u',
  );
  if (wholeWord.test(title) || destination.keywords.some((keyword) => wholeWord.test(keyword))) {
    return 1;
  }
  return 2;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchSettingsPages(
  query: string,
  appMode: MobileChatAppMode,
): SettingsPageSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  return matchingDestinations(query, appMode)
    .flatMap((destination) =>
      destination.settingsSection
        ? [
            {
              rank: matchRank(destination, needle),
              page: {
                route: destination.route,
                title: destination.title,
                settingsSection: destination.settingsSection,
              },
            },
          ]
        : [],
    )
    .sort((a, b) => a.rank - b.rank)
    .map(({ page }) => page);
}
