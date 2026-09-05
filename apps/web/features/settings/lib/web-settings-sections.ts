import type { SettingsNavKey } from '@agiworkforce/ui';

/**
 * The settings sections the WEB modal can actually render.
 *
 * `isSettingsNavKey` admits all thirty nav keys because it answers a different
 * question: is this a real section name anywhere in the product. Nine of those
 * keys, appearance, models-keys, agents, connections, cowork, agi-code,
 * agi-in-chrome, extensions, developer, exist only on Desktop, so routing a
 * web deep link on that answer landed the visitor on a modal that rendered the
 * literal string `No content for section "developer".`
 *
 * `WEB_SETTINGS_CONTENT_SECTIONS` is the exact key set of WebSettingsModal's
 * `sectionContent` map, and that map is typed against this list, so adding a
 * section without routing it, or routing one without content, is a type
 * error rather than a debug string in production.
 */
export const WEB_SETTINGS_CONTENT_SECTIONS = [
  'general',
  'account',
  'team',
  'security',
  'safety',
  'privacy',
  'archived',
  'deleted-chats',
  'shared-links',
  'billing',
  'usage',
  'capabilities',
  'memory',
  'notifications',
  'voice',
  'reflect',
  'time-focus',
  'help',
] as const satisfies readonly SettingsNavKey[];

export type WebSettingsContentSection = (typeof WEB_SETTINGS_CONTENT_SECTIONS)[number];

/**
 * Sections the shared SettingsModal shell renders itself from the adapter,
 * with no entry in `sectionContent`.
 */
export const WEB_SETTINGS_BUILT_IN_SECTIONS = [
  'connectors',
  'skills',
  'plugins',
] as const satisfies readonly SettingsNavKey[];

const WEB_SETTINGS_SECTION_SET: ReadonlySet<string> = new Set<string>([
  ...WEB_SETTINGS_CONTENT_SECTIONS,
  ...WEB_SETTINGS_BUILT_IN_SECTIONS,
]);

export function isWebSettingsSection(value: string): boolean {
  return WEB_SETTINGS_SECTION_SET.has(value);
}

export const SETTINGS_DEEP_LINK_QUERY_KEY = 'settings';
