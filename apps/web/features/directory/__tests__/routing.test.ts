import { describe, expect, it } from 'vitest';

import {
  WEB_SETTINGS_BUILT_IN_SECTIONS,
  WEB_SETTINGS_CONTENT_SECTIONS,
} from '@/features/settings/lib/web-settings-sections';

import {
  buildSettingsBrowseHash,
  buildSettingsHash,
  parseSettingsDirectoryHash,
  parseSettingsHash,
  settingsHashForSection,
  skillFileDownloadHref,
  SETTINGS_SECTION_HASH_SLUGS,
  SETTINGS_SECTION_SLUGS,
} from '../routing';

const EVERY_WEB_SECTION = [...WEB_SETTINGS_CONTENT_SECTIONS, ...WEB_SETTINGS_BUILT_IN_SECTIONS];

describe('every settings pane owns a hash', () => {
  it.each(EVERY_WEB_SECTION)('builds and parses the %s hash', (section) => {
    const hash = buildSettingsHash(section);
    expect(hash, `${section} has no hash slug`).not.toBeNull();
    expect(parseSettingsHash(hash!)).toEqual({ section, entryId: null });
  });

  it('names a slug for every section the web modal renders and no others', () => {
    expect(Object.keys(SETTINGS_SECTION_HASH_SLUGS).sort()).toEqual([...EVERY_WEB_SECTION].sort());
  });

  it('gives each pane exactly one slug', () => {
    const slugs = Object.values(SETTINGS_SECTION_HASH_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps the customize form for the three directory sections', () => {
    expect(buildSettingsHash('skills')).toBe('#settings/customize-skills');
    expect(buildSettingsHash('connectors')).toBe('#settings/customize-connectors');
    expect(buildSettingsHash('plugins')).toBe('#settings/customize-plugins');
  });

  it('does not answer to a directory section under its bare key', () => {
    expect(parseSettingsHash('#settings/skills')).toBeNull();
    expect(parseSettingsHash('#settings/connectors')).toBeNull();
    expect(parseSettingsHash('#settings/plugins')).toBeNull();
  });

  it('has no hash for a section the web modal cannot render', () => {
    expect(buildSettingsHash('developer')).toBeNull();
    expect(buildSettingsHash('not-a-section')).toBeNull();
  });
});

describe('parseSettingsHash', () => {
  it('ignores a hash that is not a settings link', () => {
    expect(parseSettingsHash('#directory/skills')).toBeNull();
    expect(parseSettingsHash('#chat/thread-1')).toBeNull();
    expect(parseSettingsHash('')).toBeNull();
    expect(parseSettingsHash('#settings')).toBeNull();
  });

  it('reads a pane the directory does not own', () => {
    expect(parseSettingsHash('#settings/billing')).toEqual({ section: 'billing', entryId: null });
    expect(parseSettingsHash('#settings/time-focus')).toEqual({
      section: 'time-focus',
      entryId: null,
    });
  });

  it('reads a browse deep link and decodes the id', () => {
    expect(parseSettingsHash('#settings/customize-connectors/browse/io.github%2Fslack')).toEqual({
      section: 'connectors',
      entryId: 'io.github/slack',
    });
  });
});

describe('parseSettingsDirectoryHash', () => {
  it('reads each customize section', () => {
    expect(parseSettingsDirectoryHash('#settings/customize-skills')).toEqual({
      section: 'skills',
      entryId: null,
    });
    expect(parseSettingsDirectoryHash('#settings/customize-connectors')).toEqual({
      section: 'connectors',
      entryId: null,
    });
    expect(parseSettingsDirectoryHash('#settings/customize-plugins')).toEqual({
      section: 'plugins',
      entryId: null,
    });
  });

  it('stays directory-only now that every pane has a hash', () => {
    expect(parseSettingsHash('#settings/billing')).not.toBeNull();
    expect(parseSettingsDirectoryHash('#settings/billing')).toBeNull();
    expect(parseSettingsDirectoryHash('#settings/memory')).toBeNull();
  });

  it('reads a browse deep link and decodes the id', () => {
    expect(
      parseSettingsDirectoryHash('#settings/customize-connectors/browse/io.github%2Fslack'),
    ).toEqual({ section: 'connectors', entryId: 'io.github/slack' });
  });

  it('treats a browse link with no id as the section itself', () => {
    expect(parseSettingsDirectoryHash('#settings/customize-plugins/browse')).toEqual({
      section: 'plugins',
      entryId: null,
    });
  });
});

describe('settingsHashForSection', () => {
  it.each(EVERY_WEB_SECTION)('names the hash for the %s pane', (section) => {
    expect(settingsHashForSection(section, '')).toBe(buildSettingsHash(section));
  });

  it('replaces a directory hash when another pane takes over', () => {
    expect(settingsHashForSection('billing', '#settings/customize-connectors')).toBe(
      '#settings/billing',
    );
  });

  it('drops a settings hash for a section the web modal cannot render', () => {
    expect(settingsHashForSection('developer', '#settings/customize-connectors')).toBe('');
  });

  it('leaves a hash the settings modal does not own alone', () => {
    expect(settingsHashForSection('developer', '#chat/thread-1')).toBeNull();
    expect(settingsHashForSection('developer', '')).toBeNull();
  });
});

describe('buildSettingsBrowseHash', () => {
  it('builds a section link', () => {
    expect(buildSettingsBrowseHash('skills')).toBe('#settings/customize-skills');
    expect(buildSettingsBrowseHash('plugins', null)).toBe('#settings/customize-plugins');
  });

  it('round trips a detail link', () => {
    const hash = buildSettingsBrowseHash('connectors', 'io.github/slack');
    expect(hash).toBe('#settings/customize-connectors/browse/io.github%2Fslack');
    expect(parseSettingsDirectoryHash(hash)).toEqual({
      section: 'connectors',
      entryId: 'io.github/slack',
    });
  });

  it('names a slug for every directory section', () => {
    expect(Object.keys(SETTINGS_SECTION_SLUGS).sort()).toEqual(['connectors', 'plugins', 'skills']);
  });
});

describe('skillFileDownloadHref', () => {
  it('encodes the skill and every path segment', () => {
    expect(skillFileDownloadHref('canvas design', 'fonts/Bold Italic.ttf')).toBe(
      '/api/skills/canvas%20design/files/fonts/Bold%20Italic.ttf?download=1',
    );
  });
});
