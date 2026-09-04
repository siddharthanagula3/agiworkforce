import type { DirectorySectionKey } from '@agiworkforce/ui';

import { SKILLS_PATH } from './constants';

const SETTINGS_PREFIX = 'settings';
const BROWSE_SEGMENT = 'browse';

export const SETTINGS_SECTION_SLUGS: Record<DirectorySectionKey, string> = {
  skills: 'customize-skills',
  connectors: 'customize-connectors',
  plugins: 'customize-plugins',
};

const SLUG_TO_SECTION = new Map<string, DirectorySectionKey>(
  Object.entries(SETTINGS_SECTION_SLUGS).map(([section, slug]) => [
    slug,
    section as DirectorySectionKey,
  ]),
);

export interface SettingsDirectoryRoute {
  section: DirectorySectionKey;
  entryId: string | null;
}

export function parseSettingsDirectoryHash(hash: string): SettingsDirectoryRoute | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const segments = raw.split('/').filter(Boolean);
  if (segments[0] !== SETTINGS_PREFIX) return null;
  const slug = segments[1];
  if (!slug) return null;
  const section = SLUG_TO_SECTION.get(slug);
  if (!section) return null;
  if (segments[2] !== BROWSE_SEGMENT) return { section, entryId: null };
  const id = segments.slice(3).join('/');
  return { section, entryId: id ? decodeURIComponent(id) : null };
}

export function buildSettingsBrowseHash(
  section: DirectorySectionKey,
  entryId?: string | null,
): string {
  const slug = SETTINGS_SECTION_SLUGS[section];
  if (!entryId) return `#${SETTINGS_PREFIX}/${slug}`;
  return `#${SETTINGS_PREFIX}/${slug}/${BROWSE_SEGMENT}/${encodeURIComponent(entryId)}`;
}

export function skillFileDownloadHref(skillId: string, path: string): string {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${SKILLS_PATH}/${encodeURIComponent(skillId)}/files/${encoded}?download=1`;
}
