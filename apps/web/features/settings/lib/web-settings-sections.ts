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

/**
 * Sections that exist only when the page is running inside the desktop shell.
 *
 * They are typed apart from `WEB_SETTINGS_CONTENT_SECTIONS` so the modal's
 * `sectionContent` map stays exhaustive over the sections a browser can reach,
 * and so a `?settings=desktop` deep link opened in a browser falls back to
 * general rather than rendering a panel with no shell behind it.
 */
export const WEB_SETTINGS_HOSTED_SECTIONS = [
  'desktop',
] as const satisfies readonly SettingsNavKey[];

export type WebSettingsHostedSection = (typeof WEB_SETTINGS_HOSTED_SECTIONS)[number];

const WEB_SETTINGS_SECTION_SET: ReadonlySet<string> = new Set<string>([
  ...WEB_SETTINGS_CONTENT_SECTIONS,
  ...WEB_SETTINGS_BUILT_IN_SECTIONS,
]);

const WEB_SETTINGS_HOSTED_SECTION_SET: ReadonlySet<string> = new Set<string>(
  WEB_SETTINGS_HOSTED_SECTIONS,
);

export function isWebSettingsSection(value: string, hosted = false): boolean {
  if (WEB_SETTINGS_SECTION_SET.has(value)) return true;
  return hosted && WEB_SETTINGS_HOSTED_SECTION_SET.has(value);
}

export const WEB_SETTINGS_FALLBACK_SECTION = 'general';

/**
 * Which section a requested one actually opens.
 *
 * A link to a desktop-only section still means "open settings" in a browser,
 * so it lands on the first section rather than doing nothing at all, which is
 * what a link that silently no-ops looks like to whoever sent it. A name that
 * is no section anywhere answers null and opens nothing.
 */
export function resolveWebSettingsSection(value: string, hosted = false): string | null {
  if (WEB_SETTINGS_SECTION_SET.has(value)) return value;
  if (!WEB_SETTINGS_HOSTED_SECTION_SET.has(value)) return null;
  return hosted ? value : WEB_SETTINGS_FALLBACK_SECTION;
}

export const SETTINGS_DEEP_LINK_QUERY_KEY = 'settings';
