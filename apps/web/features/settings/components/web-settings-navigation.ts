import { Keyboard, Mic, UserRoundPen } from 'lucide-react';
import {
  SETTINGS_NAV_GROUPS_WEB,
  SETTINGS_NAV_GROUP_CUSTOMIZE,
  SETTINGS_NAV_GROUP_DESKTOP_APP,
} from '@agiworkforce/ui';
import type { SettingsNavGroupResolved, SettingsNavItem, SettingsNavKey } from '@agiworkforce/ui';
import { canonicalWebSettingsSection, isWebSettingsSection } from '../lib/web-settings-sections';

const PERSONALIZATION_NAV_ITEM: SettingsNavItem = {
  key: 'personalization',
  label: 'Personalization',
  icon: UserRoundPen,
  keywords: [
    'memory',
    'memories',
    'facts',
    'remember',
    'manage memories',
    'custom instructions',
    'instructions',
    'about you',
    'nickname',
    'style',
    'tone',
    'characteristics',
  ],
};

const VOICE_NAV_ITEM: SettingsNavItem = {
  key: 'voice',
  label: 'Voice',
  icon: Mic,
  keywords: ['speech', 'tts', 'microphone', 'audio', 'dictation'],
};

const KEYBOARD_NAV_ITEM: SettingsNavItem = {
  key: 'keyboard',
  label: 'Keyboard',
  icon: Keyboard,
  keywords: ['shortcuts', 'keyboard shortcuts', 'keybindings', 'hotkeys', 'key combination'],
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
  { item: PERSONALIZATION_NAV_ITEM, after: 'notifications' },
  { item: VOICE_NAV_ITEM, after: 'personalization' },
  { item: KEYBOARD_NAV_ITEM, after: 'voice' },
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
  if (segment && isWebSettingsSection(segment)) return canonicalWebSettingsSection(segment);
  return SECTION_PATH_ALIASES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? null;
}
