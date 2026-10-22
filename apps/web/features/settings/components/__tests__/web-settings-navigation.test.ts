import { describe, expect, it } from 'vitest';
import { SETTINGS_NAV, isSettingsNavKey } from '@agiworkforce/ui';
import { featureDefinition, featureMaturityLabel } from '@agiworkforce/types';
import {
  WEB_SETTINGS_BUILT_IN_SECTIONS,
  WEB_SETTINGS_CONTENT_SECTIONS,
  WEB_SETTINGS_HOSTED_SECTIONS,
  WEB_SETTINGS_SECTION_ALIASES,
  canonicalWebSettingsSection,
  isWebSettingsSection,
} from '../../lib/web-settings-sections';
import {
  HOSTED_SETTINGS_NAV_GROUPS,
  WEB_SETTINGS_NAV_GROUPS,
  SETTINGS_NAV_FEATURES,
  WEB_SETTINGS_NAV_PLACEMENTS,
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

  it('opens exactly the sections the /settings/<section> route serves, each on its pane', () => {
    const disagreements = CANDIDATES.filter(
      (key) =>
        pageAdmits(key) !==
        (settingsSectionFromPath(`/settings/${key}`) === canonicalWebSettingsSection(key)),
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

  it('opens the pane a folded section now lives in, from its old address', () => {
    for (const [alias, pane] of Object.entries(WEB_SETTINGS_SECTION_ALIASES)) {
      expect(settingsSectionFromPath(`/settings/${alias}`)).toBe(pane);
      expect(RENDERED).not.toContain(alias);
      expect(RENDERED).toContain(pane);
    }
    expect(settingsSectionFromPath('/settings/memory')).toBe('personalization');
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

describe('web settings rail order', () => {
  const groupKeys = (groups: typeof WEB_SETTINGS_NAV_GROUPS, label: string) =>
    groups.find((group) => group.label === label)?.items.map((item) => item.key);

  it('lists the Settings group in the reference order', () => {
    expect(groupKeys(WEB_SETTINGS_NAV_GROUPS, 'Settings')).toEqual([
      'general',
      'notifications',
      'personalization',
      'voice',
      'keyboard',
      'capabilities',
      'privacy',
      'safety',
      'security',
      'account',
      'billing',
      'usage',
      'referrals',
      'team',
      'reflect',
      'time-focus',
      'help',
    ]);
  });

  it('keeps Customize after Settings, with Memory moved into Personalization', () => {
    expect(WEB_SETTINGS_NAV_GROUPS.map((group) => group.label)).toEqual(['Settings', 'Customize']);
    expect(groupKeys(WEB_SETTINGS_NAV_GROUPS, 'Customize')).toEqual([
      'skills',
      'connectors',
      'plugins',
      'slack',
    ]);
    expect(railKeys(WEB_SETTINGS_NAV_GROUPS)).not.toContain('memory');
  });

  it('labels the Personalization row and keeps memory findable in settings search', () => {
    const item = WEB_SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find(
      (entry) => entry.key === 'personalization',
    );
    expect(item?.label).toBe('Personalization');
    expect(item?.keywords).toEqual(expect.arrayContaining(['memory', 'custom instructions']));
  });

  it('labels the Keyboard row and keeps shortcuts findable in settings search', () => {
    const item = WEB_SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find(
      (entry) => entry.key === 'keyboard',
    );
    expect(item?.label).toBe('Keyboard');
    expect(item?.keywords).toEqual(expect.arrayContaining(['shortcuts', 'keybindings']));
    expect(settingsSectionFromPath('/settings/keyboard')).toBe('keyboard');
  });

  it('places every web-only item exactly once, right after its anchor', () => {
    const keys = railKeys(WEB_SETTINGS_NAV_GROUPS);
    for (const { item, after } of WEB_SETTINGS_NAV_PLACEMENTS) {
      expect(keys.filter((key) => key === item.key)).toEqual([item.key]);
      expect(keys[keys.indexOf(item.key) - 1]).toBe(after);
    }
  });

  it('keeps the same Settings order when the desktop shell hosts the page', () => {
    expect(groupKeys(HOSTED_SETTINGS_NAV_GROUPS, 'Settings')).toEqual(
      groupKeys(WEB_SETTINGS_NAV_GROUPS, 'Settings'),
    );
  });
});

describe('web settings rail maturity labels', () => {
  const rows = (groups: typeof WEB_SETTINGS_NAV_GROUPS) => groups.flatMap((group) => group.items);
  const registryLabel = (featureId: string) => {
    const definition = featureDefinition(featureId);
    return definition ? featureMaturityLabel(definition.maturity) : null;
  };

  it('maps each labelled row to a feature the registry defines', () => {
    for (const featureId of Object.values(SETTINGS_NAV_FEATURES)) {
      expect(featureDefinition(featureId ?? '')).not.toBeNull();
    }
  });

  it('labels each row with its feature maturity from the registry, in both rails', () => {
    for (const groups of [WEB_SETTINGS_NAV_GROUPS, HOSTED_SETTINGS_NAV_GROUPS]) {
      for (const item of rows(groups)) {
        const featureId = SETTINGS_NAV_FEATURES[item.key];
        expect(item.maturityLabel ?? null).toBe(featureId ? registryLabel(featureId) : null);
      }
    }
  });

  it('maps rows that both rails can show, so the labels are not vacuous', () => {
    const hostedKeys = new Set(rows(HOSTED_SETTINGS_NAV_GROUPS).map((item) => item.key));
    expect(Object.keys(SETTINGS_NAV_FEATURES).every((key) => hostedKeys.has(key as never))).toBe(
      true,
    );
    expect(Object.keys(SETTINGS_NAV_FEATURES)).toEqual(
      expect.arrayContaining(['plugins', 'computer-use']),
    );
  });

  it('leaves generally available rows unlabelled', () => {
    const web = rows(WEB_SETTINGS_NAV_GROUPS);
    for (const key of ['general', 'skills', 'connectors']) {
      expect(web.find((item) => item.key === key)?.maturityLabel).toBeUndefined();
    }
  });
});
