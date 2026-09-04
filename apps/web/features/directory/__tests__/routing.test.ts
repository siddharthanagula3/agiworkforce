import { describe, expect, it } from 'vitest';

import {
  buildSettingsBrowseHash,
  parseSettingsDirectoryHash,
  skillFileDownloadHref,
  SETTINGS_SECTION_SLUGS,
} from '../routing';

describe('parseSettingsDirectoryHash', () => {
  it('ignores a hash that is not a settings link', () => {
    expect(parseSettingsDirectoryHash('#directory/skills')).toBeNull();
    expect(parseSettingsDirectoryHash('')).toBeNull();
  });

  it('ignores a settings section the directory does not own', () => {
    expect(parseSettingsDirectoryHash('#settings/billing')).toBeNull();
  });

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

  it('names a slug for every section', () => {
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
