import type { SettingsNavKey } from '@agiworkforce/ui';

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
