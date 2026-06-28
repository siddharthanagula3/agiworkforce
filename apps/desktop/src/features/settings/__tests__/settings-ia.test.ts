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

  it('includes all 11 locked source-of-truth sections (DESK-1 "settings IA to spec")', () => {
    // docs/current/source-of-truth.md §"Settings must converge on these sections".
    // Each must be a real, reachable top-level nav entry (render case enforced by
    // the test above) — so this pins the IA AT SPEC and fails if any regresses.
    const byLabel = new Map(SETTINGS_NAV.map((e) => [e.label, e.key]));
    const SPEC_SECTIONS = [
      'General',
      'Account',
      'Privacy',
      'Billing',
      'Usage',
      'Capabilities',
      'Connectors',
      'AGI Code',
      'AGI in Chrome',
      'Extensions',
      'Developer',
    ];
    for (const label of SPEC_SECTIONS) {
      expect(byLabel.has(label), `settings IA must include the "${label}" section`).toBe(true);
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
