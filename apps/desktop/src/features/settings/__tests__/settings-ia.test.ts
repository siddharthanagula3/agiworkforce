import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETTINGS_NAV, SETTINGS_NAV_GROUPS } from '@agiworkforce/ui';

/**
 * DESK-1 / DESK-2 settings IA contract: the settings navigation and its renderer
 * must stay consistent — every nav entry MUST resolve to a rendered panel (no
 * orphaned/dead settings mode), and every grouped key MUST exist in the flat nav.
 * Pure source/data assertions; no app runtime required.
 */
const panelSrc = readFileSync(join(__dirname, '..', 'SettingsPanel.tsx'), 'utf8');

describe('desktop settings IA · nav ↔ render consistency', () => {
  it('renders a panel for every SETTINGS_NAV entry (no orphaned settings mode)', () => {
    expect(SETTINGS_NAV.length).toBeGreaterThan(0);
    for (const entry of SETTINGS_NAV) {
      // SettingsPanel.renderTabContent must have an explicit `case '<key>':`.
      expect(
        panelSrc,
        `SETTINGS_NAV key "${entry.key}" has no render case → orphaned mode`,
      ).toContain(`case '${entry.key}':`);
      expect(entry.label.length, `${entry.key} must have a visible label`).toBeGreaterThan(0);
    }
  });

  it('keeps the core locked sections present (General/Account/Privacy/Connectors)', () => {
    const keys = new Set(SETTINGS_NAV.map((e) => e.key));
    for (const required of ['general', 'account', 'privacy', 'connectors'] as const) {
      expect(keys, `settings IA must include "${required}"`).toContain(required);
    }
  });

  it('every nav group references only keys that exist in the flat nav', () => {
    const keys = new Set(SETTINGS_NAV.map((e) => e.key));
    for (const group of SETTINGS_NAV_GROUPS) {
      for (const key of group.keys) {
        expect(
          keys,
          `group "${group.label ?? 'default'}" references unknown key "${key}"`,
        ).toContain(key);
      }
    }
  });

  it('every flat nav key belongs to exactly one nav group (no ungrouped/dangling entry)', () => {
    const grouped = new Set(SETTINGS_NAV_GROUPS.flatMap((g) => g.keys));
    for (const entry of SETTINGS_NAV) {
      expect(grouped, `nav key "${entry.key}" is not placed in any group`).toContain(entry.key);
    }
  });
});
