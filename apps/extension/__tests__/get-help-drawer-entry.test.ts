import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(resolve(here, '../src/side_panel.ts'), 'utf8');
const iconSource = readFileSync(resolve(here, '../src/assets/icons.ts'), 'utf8');
const optionsSource = readFileSync(resolve(here, '../src/options.ts'), 'utf8');

function drawerRow(id: string): string {
  const start = panelSource.indexOf(`id: '${id}'`);
  expect(start, `${id} is not built in the drawer`).toBeGreaterThan(-1);
  return panelSource.slice(Math.max(0, start - 200), start + 600);
}

describe('Get help drawer entry', () => {
  it('sits in Tools beside Settings', () => {
    const toolsStart = panelSource.indexOf('const toolsSection = ');
    const toolsEnd = panelSource.indexOf('toolsSection.appendChild(toolsRow);', toolsStart);
    const tools = panelSource.slice(toolsStart, toolsEnd);
    expect(tools).toContain("id: 'sp-drawer-help-btn'");
    expect(tools.indexOf("id: 'sp-drawer-options-btn'")).toBeLessThan(
      tools.indexOf("id: 'sp-drawer-help-btn'"),
    );
  });

  it('reuses the tool-button primitive rather than a bespoke control', () => {
    const row = drawerRow('sp-drawer-help-btn');
    expect(row).toContain("class: 'sp-drawer-tool-btn'");
    expect(row).toContain("' Get help'");
    expect(row).toContain('renderIcon(CircleHelp, 13)');
  });

  it('opens the help centre and says where the visit came from', () => {
    expect(panelSource).toContain(
      "const HELP_URL = 'https://agiworkforce.com/help?from=chrome-extension';",
    );
    expect(drawerRow('sp-drawer-help-btn')).toContain('chrome.tabs.create({ url: HELP_URL })');
  });

  it('draws the icon from the shared vocabulary, not from an inline svg', () => {
    expect(iconSource).toContain('export const CircleHelp = svg(');
    expect(drawerRow('sp-drawer-help-btn')).not.toContain('<svg');
  });

  it('keeps the options page help section, which is the long-form entry', () => {
    expect(optionsSource).toContain("label: 'Help center'");
    expect(optionsSource).toContain("path: '/help'");
  });
});
