import { Brain, Mic } from 'lucide-react';
import {
  SETTINGS_NAV_GROUPS_WEB,
  SETTINGS_NAV_GROUP_CUSTOMIZE,
  SETTINGS_NAV_GROUP_DESKTOP_APP,
} from '@agiworkforce/ui';
import type { SettingsNavGroupResolved, SettingsNavItem } from '@agiworkforce/ui';
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

const VOICE_NAV_ANCHOR = 'notifications';

export const WEB_SETTINGS_NAV_GROUPS: SettingsNavGroupResolved[] = SETTINGS_NAV_GROUPS_WEB.map(
  (group) =>
    group.label === SETTINGS_NAV_GROUP_CUSTOMIZE
      ? { ...group, items: [...group.items, MEMORY_NAV_ITEM] }
      : {
          ...group,
          items: group.items.flatMap((item) =>
            item.key === VOICE_NAV_ANCHOR ? [item, VOICE_NAV_ITEM] : [item],
          ),
        },
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
