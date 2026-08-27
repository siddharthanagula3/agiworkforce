import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { SETTINGS_NAV, SETTINGS_NAV_GROUPS_WEB, isSettingsNavKey } from '@agiworkforce/ui';

import {
  WEB_SETTINGS_BUILT_IN_SECTIONS,
  WEB_SETTINGS_CONTENT_SECTIONS,
  isWebSettingsSection,
} from '../lib/web-settings-sections';

const DESKTOP_ONLY_SECTIONS = [
  'appearance',
  'models-keys',
  'agents',
  'connections',
  'cowork',
  'agi-code',
  'agi-in-chrome',
  'extensions',
  'developer',
] as const;

// Every nav key renders /settings/<key> through SettingsSectionLink. Before the
// catch-all, a dozen keys had no directory and a bookmarked or shared link to
// one 404'd. claude.ai routes settings through a hash so no key can miss.
describe('every settings section can be deep-linked', () => {
  it('accepts every key the nav renders', () => {
    for (const entry of SETTINGS_NAV) {
      expect(isSettingsNavKey(entry.key), `${entry.key} is not routable`).toBe(true);
    }
  });

  it('accepts the web-only sections that have their own routes', () => {
    for (const key of ['security', 'safety', 'team', 'skills', 'archived', 'shared-links']) {
      expect(isSettingsNavKey(key), `${key} is not routable`).toBe(true);
    }
  });

  it('has a catch-all route so a key without its own directory still resolves', () => {
    expect(existsSync(join(process.cwd(), 'app/settings/[section]/page.tsx'))).toBe(true);
  });

  it('rejects a key that does not exist', () => {
    // A link to a section that is not real is a broken link. Quietly opening
    // General instead hides that from whoever shared it.
    expect(isSettingsNavKey('not-a-section')).toBe(false);
    expect(isSettingsNavKey('')).toBe(false);
  });

  it('rejects a traversal attempt rather than routing it', () => {
    expect(isSettingsNavKey('../admin')).toBe(false);
  });

  // `isSettingsNavKey` admits all thirty nav keys, nine of which exist only on
  // Desktop. Routing on that answer opened a modal rendering the literal string
  // `No content for section "developer".` at the user.
  it.each(DESKTOP_ONLY_SECTIONS)('does not route the desktop-only %s section on web', (key) => {
    expect(isSettingsNavKey(key)).toBe(true);
    expect(isWebSettingsSection(key)).toBe(false);
  });

  it('routes every section the web nav rail offers', () => {
    for (const group of SETTINGS_NAV_GROUPS_WEB) {
      for (const item of group.items) {
        expect(
          isWebSettingsSection(item.key),
          `${item.key} is in the web rail but not routable`,
        ).toBe(true);
      }
    }
  });

  it('routes exactly the sections the web modal can render', () => {
    const routable = [...WEB_SETTINGS_CONTENT_SECTIONS, ...WEB_SETTINGS_BUILT_IN_SECTIONS];
    for (const key of routable) expect(isWebSettingsSection(key)).toBe(true);
    for (const key of routable) expect(isSettingsNavKey(key)).toBe(true);
  });

  it('has every section actually linked in the product point at a real key', () => {
    // SettingsSectionLink renders /settings/<section>. A typo here is a 404 for
    // whoever clicks it, and nothing else would catch it — the string is not
    // typed at the call site.
    const used = execFileSync(
      'grep',
      ['-rhoE', 'section="[a-z-]+"', '--include=*.tsx', 'features', 'app', 'shared'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    const sections = [...new Set([...used.matchAll(/section="([a-z-]+)"/g)].map((m) => m[1]!))];

    expect(sections.length).toBeGreaterThan(10);
    const invalid = sections.filter((section) => !isSettingsNavKey(section));
    expect(invalid, `settings link(s) pointing at no such section: ${invalid.join(', ')}`).toEqual(
      [],
    );
  });
});
