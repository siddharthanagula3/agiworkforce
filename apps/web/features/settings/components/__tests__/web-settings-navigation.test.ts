import { describe, expect, it } from 'vitest';
import { SETTINGS_NAV, isSettingsNavKey } from '@agiworkforce/ui';
import {
  WEB_SETTINGS_BUILT_IN_SECTIONS,
  WEB_SETTINGS_CONTENT_SECTIONS,
  WEB_SETTINGS_HOSTED_SECTIONS,
  isWebSettingsSection,
} from '../../lib/web-settings-sections';
import {
  HOSTED_SETTINGS_NAV_GROUPS,
  WEB_SETTINGS_NAV_GROUPS,
  settingsSectionFromPath,
} from '../web-settings-navigation';

const RENDERED = [...WEB_SETTINGS_CONTENT_SECTIONS, ...WEB_SETTINGS_BUILT_IN_SECTIONS];
const railKeys = (groups: typeof WEB_SETTINGS_NAV_GROUPS) =>
  groups.flatMap((group) => group.items.map((item) => item.key));
const CANDIDATES = [
  ...new Set<string>([
    ...SETTINGS_NAV.map((entry) => entry.key),
    ...RENDERED,
    ...WEB_SETTINGS_HOSTED_SECTIONS,
    ...railKeys(HOSTED_SETTINGS_NAV_GROUPS),
  ]),
];
const pageAdmits = (key: string) => isSettingsNavKey(key) && isWebSettingsSection(key);

/**
 * Conversation data is managed from Privacy rather than given rail entries of
 * its own, the arrangement ConversationDataSections.test.tsx pins.
 */
const REACHED_FROM_PRIVACY = ['archived', 'deleted-chats', 'shared-links'];

describe('web settings answer every address from one section list', () => {
  it('checks every section name the product knows, not a sample', () => {
    expect(CANDIDATES.length).toBeGreaterThanOrEqual(RENDERED.length + 9);
  });

  it('opens exactly the sections the /settings/<section> route serves, each on itself', () => {
    const disagreements = CANDIDATES.filter(
      (key) => pageAdmits(key) !== (settingsSectionFromPath(`/settings/${key}`) === key),
    );
    expect(disagreements).toEqual([]);
    expect(RENDERED.every((key) => settingsSectionFromPath(`/settings/${key}/`) === key)).toBe(
      true,
    );
  });

  it('opens nothing for an address that names no section this surface renders', () => {
    const desktopOnly = CANDIDATES.filter((key) => !isWebSettingsSection(key));
    expect(desktopOnly.length).toBeGreaterThan(0);
    for (const key of [...desktopOnly, 'not-a-section']) {
      expect(settingsSectionFromPath(`/settings/${key}`)).toBeNull();
    }
    expect(settingsSectionFromPath(null)).toBeNull();
    expect(settingsSectionFromPath('/chat')).toBeNull();
  });

  it('keeps the directory routes on the sections they have always opened', () => {
    expect(settingsSectionFromPath('/connectors')).toBe('connectors');
    expect(settingsSectionFromPath('/skills/new')).toBe('skills');
    expect(settingsSectionFromPath('/apps')).toBe('plugins');
  });

  it('lists only sections the browser can render in the web rail', () => {
    expect(railKeys(WEB_SETTINGS_NAV_GROUPS).filter((key) => !isWebSettingsSection(key))).toEqual(
      [],
    );
  });

  it('lists only sections the desktop shell can render in the hosted rail', () => {
    expect(
      railKeys(HOSTED_SETTINGS_NAV_GROUPS).filter((key) => !isWebSettingsSection(key, true)),
    ).toEqual([]);
    expect(railKeys(HOSTED_SETTINGS_NAV_GROUPS)).toEqual(
      expect.arrayContaining([...WEB_SETTINGS_HOSTED_SECTIONS]),
    );
    expect(railKeys(WEB_SETTINGS_NAV_GROUPS)).not.toEqual(
      expect.arrayContaining([...WEB_SETTINGS_HOSTED_SECTIONS]),
    );
  });

  it('reaches every rendered section from the rail, or from Privacy for conversation data', () => {
    const rail = new Set(railKeys(WEB_SETTINGS_NAV_GROUPS));
    expect(RENDERED.filter((key) => !rail.has(key)).sort()).toEqual(
      [...REACHED_FROM_PRIVACY].sort(),
    );
  });

  it('never lists a section twice in one rail', () => {
    for (const groups of [WEB_SETTINGS_NAV_GROUPS, HOSTED_SETTINGS_NAV_GROUPS]) {
      const keys = railKeys(groups);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
