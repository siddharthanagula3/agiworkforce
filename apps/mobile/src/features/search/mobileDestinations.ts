import type { MobileGlobalSearchResult } from './mobileGlobalSearch';

export interface MobileDestination {
  route: string;
  title: string;
  section: string;
  keywords: readonly string[];
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
    title: 'Cloud code sessions',
    section: 'Go to',
    keywords: ['code', 'repository', 'agi code'],
  },
  {
    route: '/(app)/companion',
    title: 'Remote',
    section: 'Go to',
    keywords: ['desktop', 'pair', 'computer'],
  },
  {
    route: '/(app)/connectors',
    title: 'Connectors',
    section: 'Go to',
    keywords: ['integrations', 'apps', 'mcp'],
  },
  { route: '/(app)/skills', title: 'Skills', section: 'Go to', keywords: ['plugins'] },
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
    keywords: ['language', 'startup'],
  },
  {
    route: '/(app)/settings/appearance',
    title: 'Appearance',
    section: 'Settings',
    keywords: ['theme', 'dark mode', 'text size'],
  },
  {
    route: '/(app)/settings/personalization',
    title: 'Personalization',
    section: 'Settings',
    keywords: ['custom instructions', 'name', 'style'],
  },
  {
    route: '/(app)/settings/memory',
    title: 'Memory',
    section: 'Settings',
    keywords: ['remember', 'saved memories'],
  },
  {
    route: '/(app)/settings/voice',
    title: 'Voice',
    section: 'Settings',
    keywords: ['speech', 'read aloud'],
  },
  {
    route: '/(app)/settings/voice-language',
    title: 'Voice language',
    section: 'Settings',
    keywords: ['dictation', 'speech language'],
  },
  {
    route: '/(app)/settings/notifications',
    title: 'Notification settings',
    section: 'Settings',
    keywords: ['push', 'alerts'],
  },
  {
    route: '/(app)/settings/data-controls',
    title: 'Data controls',
    section: 'Settings',
    keywords: ['export', 'delete', 'training', 'privacy'],
  },
  {
    route: '/(app)/settings/archived-chats',
    title: 'Archived chats',
    section: 'Settings',
    keywords: ['archive'],
  },
  {
    route: '/(app)/settings/shared-links',
    title: 'Shared links',
    section: 'Settings',
    keywords: ['share', 'links'],
  },
  {
    route: '/(app)/settings/capabilities',
    title: 'Capabilities',
    section: 'Settings',
    keywords: ['web search', 'code', 'images', 'tools'],
  },
  {
    route: '/(app)/settings/account-security',
    title: 'Account security',
    section: 'Settings',
    keywords: ['password', 'two-factor', 'mfa', 'sessions', 'log out'],
  },
  {
    route: '/(app)/settings/workspace',
    title: 'Workspace',
    section: 'Settings',
    keywords: ['team', 'members', 'roles', 'invite'],
  },
  {
    route: '/(app)/settings/cloud-billing',
    title: 'Billing',
    section: 'Settings',
    keywords: ['plan', 'subscription', 'payment', 'credits'],
  },
  {
    route: '/(app)/settings/cloud-usage',
    title: 'Usage',
    section: 'Settings',
    keywords: ['limits', 'credits', 'tokens'],
  },
  {
    route: '/(app)/settings/storage',
    title: 'Storage',
    section: 'Settings',
    keywords: ['cache', 'space'],
  },
  {
    route: '/(app)/settings/parental-controls',
    title: 'Parental controls',
    section: 'Settings',
    keywords: ['family', 'teen'],
  },
  {
    route: '/(app)/about',
    title: 'About',
    section: 'Settings',
    keywords: ['version', 'legal', 'licenses'],
  },
];

export function searchMobileDestinations(query: string): MobileGlobalSearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return MOBILE_DESTINATIONS.filter(
    (destination) =>
      destination.title.toLocaleLowerCase().includes(needle) ||
      destination.keywords.some((keyword) => keyword.includes(needle)),
  ).map((destination) => ({
    id: destination.route,
    title: destination.title,
    subtitle: destination.section,
    targetId: destination.route,
  }));
}
