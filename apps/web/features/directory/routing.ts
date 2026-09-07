import type { DirectorySectionKey } from '@agiworkforce/ui';

import {
  WEB_SETTINGS_BUILT_IN_SECTIONS,
  WEB_SETTINGS_CONTENT_SECTIONS,
} from '@/features/settings/lib/web-settings-sections';

import { SKILLS_PATH } from './constants';

const SETTINGS_PREFIX = 'settings';
const BROWSE_SEGMENT = 'browse';
const CUSTOM_SEGMENT = 'new';

export const SETTINGS_SECTION_SLUGS: Record<DirectorySectionKey, string> = {
  skills: 'customize-skills',
  connectors: 'customize-connectors',
  plugins: 'customize-plugins',
};

/**
 * Derived from the sections the web modal can render, so a new pane cannot ship
 * without a hash. The directory sections override their identity slug with the
 * `customize-` form their detail links already use, leaving one hash per pane.
 */
const SECTION_TO_SLUG: ReadonlyMap<string, string> = new Map<string, string>([
  ...[...WEB_SETTINGS_CONTENT_SECTIONS, ...WEB_SETTINGS_BUILT_IN_SECTIONS].map(
    (section) => [section, section] as const,
  ),
  ...Object.entries(SETTINGS_SECTION_SLUGS),
]);

const SLUG_TO_SECTION: ReadonlyMap<string, string> = new Map(
  [...SECTION_TO_SLUG].map(([section, slug]) => [slug, section]),
);

const DIRECTORY_SECTIONS: ReadonlySet<string> = new Set(Object.keys(SETTINGS_SECTION_SLUGS));

export const SETTINGS_SECTION_HASH_SLUGS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(SECTION_TO_SLUG),
);

export interface SettingsRoute {
  section: string;
  entryId: string | null;
  custom: boolean;
}

export interface SettingsDirectoryRoute {
  section: DirectorySectionKey;
  entryId: string | null;
}

export function parseSettingsHash(hash: string): SettingsRoute | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const segments = raw.split('/').filter(Boolean);
  if (segments[0] !== SETTINGS_PREFIX) return null;
  const slug = segments[1];
  if (!slug) return null;
  const section = SLUG_TO_SECTION.get(slug);
  if (!section) return null;
  const detail = segments[2];
  if (detail === CUSTOM_SEGMENT) return { section, entryId: null, custom: true };
  if (detail !== BROWSE_SEGMENT) return { section, entryId: null, custom: false };
  const id = segments.slice(3).join('/');
  return { section, entryId: id ? decodeURIComponent(id) : null, custom: false };
}

export function parseSettingsDirectoryHash(hash: string): SettingsDirectoryRoute | null {
  const route = parseSettingsHash(hash);
  if (!route || !DIRECTORY_SECTIONS.has(route.section)) return null;
  return { section: route.section as DirectorySectionKey, entryId: route.entryId };
}

export function buildSettingsBrowseHash(
  section: DirectorySectionKey,
  entryId?: string | null,
): string {
  const slug = SETTINGS_SECTION_SLUGS[section];
  if (!entryId) return `#${SETTINGS_PREFIX}/${slug}`;
  return `#${SETTINGS_PREFIX}/${slug}/${BROWSE_SEGMENT}/${encodeURIComponent(entryId)}`;
}

export function buildSettingsHash(section: string): string | null {
  const slug = SECTION_TO_SLUG.get(section);
  return slug ? `#${SETTINGS_PREFIX}/${slug}` : null;
}

export function buildSettingsCustomConnectorHash(): string {
  return `#${SETTINGS_PREFIX}/${SETTINGS_SECTION_SLUGS.connectors}/${CUSTOM_SEGMENT}`;
}

export function settingsHashForSection(section: string, currentHash: string): string | null {
  const next = buildSettingsHash(section);
  if (next) return next;
  return parseSettingsHash(currentHash) ? '' : null;
}

export function replaceSettingsHash(next: string): void {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${next}`,
  );
}

export function skillFileDownloadHref(skillId: string, path: string): string {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${SKILLS_PATH}/${encodeURIComponent(skillId)}/files/${encoded}?download=1`;
}
