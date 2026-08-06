import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SETTINGS_NAV, SETTINGS_NAV_GROUPS, type SettingsNavKey } from '@agiworkforce/ui';

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

describe('desktop settings IA · legacy tab aliases', () => {
  // Callers all over the app still open settings with pre-IA tab ids
  // (openSettingsDialog('mcp'), deep links, stored preferences). resolveTab in
  // SettingsPanel.tsx maps them through LEGACY_TAB_MAP, so every alias target
  // must be a live SETTINGS_NAV entry or the panel silently renders nothing.
  const canonical = new Set(SETTINGS_NAV.map((e) => e.key));

  it('every legacy alias lands on a canonical, rendered nav entry', async () => {
    const { LEGACY_TAB_MAP } = await import('../../../stores/settings/dialog');
    for (const [alias, target] of Object.entries(LEGACY_TAB_MAP)) {
      expect(canonical, `alias "${alias}" maps to unknown tab "${target}"`).toContain(target);
    }
  });

  it('no legacy alias shadows a canonical tab id', async () => {
    const { LEGACY_TAB_MAP } = await import('../../../stores/settings/dialog');
    for (const alias of Object.keys(LEGACY_TAB_MAP)) {
      expect(
        canonical.has(alias as SettingsNavKey),
        `canonical tab "${alias}" must not be remapped`,
      ).toBe(false);
    }
  });

  it('pins the alias targets callers depend on', async () => {
    const { LEGACY_TAB_MAP } = await import('../../../stores/settings/dialog');
    expect(LEGACY_TAB_MAP.skills).toBe('capabilities');
    expect(LEGACY_TAB_MAP.customize).toBe('capabilities');
    expect(LEGACY_TAB_MAP.mcp).toBe('connectors');
    expect(LEGACY_TAB_MAP['mcp-server']).toBe('connectors');
    expect(LEGACY_TAB_MAP.analytics).toBe('privacy');
    expect(LEGACY_TAB_MAP.themes).toBe('appearance');
    expect(LEGACY_TAB_MAP.keybindings).toBe('general');
    expect(LEGACY_TAB_MAP['api-keys']).toBe('models-keys');
    expect(LEGACY_TAB_MAP['task-routing']).toBe('models-keys');
  });
});
