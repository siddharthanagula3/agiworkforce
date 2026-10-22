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

type SettingsNavFields = NonNullable<SettingsNavItem['fields']>;

export const WEB_SETTINGS_NAV_FIELDS: Partial<Record<SettingsNavKey, SettingsNavFields>> = {
  general: [
    { label: 'Theme', keywords: ['dark mode', 'light mode'] },
    { label: 'Accent colour', keywords: ['accent color'] },
    { label: 'Contrast', keywords: ['high contrast'] },
    { label: 'Motion', keywords: ['reduce motion', 'animation'] },
    { label: 'Reasoning effort', keywords: ['thinking'] },
    { label: 'Chat font', keywords: ['typeface', 'sans serif', 'dyslexic', 'dyslexia'] },
    { label: 'Chat text size', keywords: ['font size'] },
    { label: 'Wrap long code lines', keywords: ['code block', 'word wrap'] },
    { label: 'Code theme', keywords: ['syntax highlighting'] },
    { label: 'New chats start in' },
    { label: 'Send with Enter', keywords: ['enter key', 'new line'] },
    { label: 'Show follow-up suggestions in chats', keywords: ['suggested replies'] },
    { label: 'Follow-up behavior' },
  ],
  notifications: [
    { label: 'Reply ready' },
    { label: 'Scheduled task finished', keywords: ['scheduled tasks'] },
    { label: 'Security alerts', keywords: ['sign-in alert', 'new device'] },
    { label: 'Agent run updates', keywords: ['push notifications'] },
  ],
  capabilities: [
    {
      label: 'Cloud code execution and file creation',
      keywords: ['sandbox', 'run code', 'file creation'],
    },
    { label: 'Default approval for tool actions', keywords: ['approvals', 'ask before'] },
  ],
  personalization: [
    { label: 'Response style' },
    { label: 'Response length' },
    { label: 'Technical level' },
    { label: 'Preferred formatting', keywords: ['markdown'] },
    { label: 'Response language', keywords: ['reply language'] },
    { label: 'Warmth' },
    { label: 'Enthusiasm' },
    { label: 'Headers and lists' },
    { label: 'Emoji' },
    { label: 'Apply instructions for AGI' },
    { label: 'Persistent memory' },
    { label: 'Save memories from chats' },
    { label: 'Search past chats', keywords: ['chat history', 'reference chats'] },
    { label: 'Include sensitive topics in memory' },
    { label: 'Allow memory generation from tool-assisted chats' },
  ],
  voice: [{ label: 'Dictation' }, { label: 'Dictation language' }],
};

export const HOSTED_SETTINGS_NAV_FIELDS: Partial<Record<SettingsNavKey, SettingsNavFields>> = {
  capabilities: [
    { label: 'Remote Control', keywords: ['phone', 'pair', 'control remotely'] },
    { label: 'Chrome', keywords: ['browser pairing', 'pair browser'] },
  ],
  desktop: [
    { label: 'Run on startup', keywords: ['launch at login', 'open at login'] },
    { label: 'Menu bar', keywords: ['tray'] },
    { label: 'Keep computer awake', keywords: ['prevent sleep', 'sleep', 'caffeinate'] },
  ],
  'computer-use': [
    { label: 'Any app', keywords: ['control apps', 'mouse', 'keyboard'] },
    { label: 'Allowed apps', keywords: ['app permissions'] },
    { label: 'Refused apps', keywords: ['denied apps', 'block app', 'add app'] },
  ],
};

function withFields(
  items: SettingsNavItem[],
  ...sources: Partial<Record<SettingsNavKey, SettingsNavFields>>[]
): SettingsNavItem[] {
  return items.map((item) => {
    const fields = sources.flatMap((source) => source[item.key] ?? []);
    return fields.length > 0 ? { ...item, fields: [...(item.fields ?? []), ...fields] } : item;
  });
}

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
    items: withFields(placeWebItems(group.items), WEB_SETTINGS_NAV_FIELDS),
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
].map((group) => ({ ...group, items: withFields(group.items, HOSTED_SETTINGS_NAV_FIELDS) }));

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
