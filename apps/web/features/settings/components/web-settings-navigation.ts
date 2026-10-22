import { Brain, Mic } from 'lucide-react';
import {
  SETTINGS_NAV_GROUPS_WEB,
  SETTINGS_NAV_GROUP_CUSTOMIZE,
  SETTINGS_NAV_GROUP_DESKTOP_APP,
} from '@agiworkforce/ui';
import type { SettingsNavGroupResolved, SettingsNavItem, SettingsNavKey } from '@agiworkforce/ui';
import { isWebSettingsSection } from '../lib/web-settings-sections';

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

const GENERAL_NAV_KEY = 'general';

const GENERAL_NAV_FIELDS: NonNullable<SettingsNavItem['fields']> = [
  { label: 'Chat font', keywords: ['typeface', 'sans serif', 'dyslexic', 'dyslexia'] },
  { label: 'Chat text size', keywords: ['font size'] },
];

interface WebSettingsNavPlacement {
  item: SettingsNavItem;
  after: SettingsNavKey;
}

export const WEB_SETTINGS_NAV_PLACEMENTS: readonly WebSettingsNavPlacement[] = [
  { item: VOICE_NAV_ITEM, after: 'notifications' },
  { item: MEMORY_NAV_ITEM, after: 'slack' },
];

function placeWebItems(items: SettingsNavItem[]): SettingsNavItem[] {
  return WEB_SETTINGS_NAV_PLACEMENTS.reduce((placed, { item, after }) => {
    const anchor = placed.findIndex((entry) => entry.key === after);
    if (anchor === -1) return placed;
    return [...placed.slice(0, anchor + 1), item, ...placed.slice(anchor + 1)];
  }, items);
}

export const WEB_SETTINGS_NAV_GROUPS: SettingsNavGroupResolved[] = SETTINGS_NAV_GROUPS_WEB.map(
  (group) => ({
    ...group,
    items: placeWebItems(
      group.items.map((item) =>
        item.key === GENERAL_NAV_KEY ? { ...item, fields: GENERAL_NAV_FIELDS } : item,
      ),
    ),
  }),
);

/**
 * The shell's own settings sit between Settings and Customize, and only when
 * there is a shell: a browser has nothing behind that group to configure.
 */
export const HOSTED_SETTINGS_NAV_GROUPS: SettingsNavGroupResolved[] = [
  ...WEB_SETTINGS_NAV_GROUPS.filter((group) => group.label !== SETTINGS_NAV_GROUP_CUSTOMIZE),
  SETTINGS_NAV_GROUP_DESKTOP_APP,
  ...WEB_SETTINGS_NAV_GROUPS.filter((group) => group.label === SETTINGS_NAV_GROUP_CUSTOMIZE),
];

const SECTION_PATH_ALIASES: ReadonlyArray<readonly [prefix: string, section: string]> = [
  ['/connectors', 'connectors'],
  ['/skills', 'skills'],
  ['/apps', 'plugins'],
];

export function settingsSectionFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const segment = /^\/settings\/([^/]+)/.exec(pathname)?.[1];
  if (segment && isWebSettingsSection(segment)) return segment;
  return SECTION_PATH_ALIASES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null;
}
