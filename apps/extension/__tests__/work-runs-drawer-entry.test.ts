import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { listChromeManagedRuns } from '../src/features/cloud-bridge/managedRunControl';

const here = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(resolve(here, '../src/side_panel.ts'), 'utf8');

function drawerRow(id: string): string {
  const start = panelSource.indexOf(`id: '${id}'`);
  expect(start, `${id} is not built in the drawer`).toBeGreaterThan(-1);
  return panelSource.slice(start, start + 900);
}

describe('Work runs drawer entry', () => {
  it('sits in Automate beside the other launchers', () => {
    const automateStart = panelSource.indexOf("'Automate'");
    const toolsStart = panelSource.indexOf("'Tools'", automateStart);
    const automateSection = panelSource.slice(automateStart, toolsStart);

    expect(automateSection).toContain("id: 'sp-drawer-runs-btn'");
    expect(automateSection).toContain("'Work runs'");
    expect(automateSection).toContain("'Runs you started on any device'");
  });

  it('reuses the launcher row primitives rather than a bespoke control', () => {
    const row = drawerRow('sp-drawer-runs-btn');
    expect(row).toContain("class: 'sp-drawer-launcher-btn'");
    expect(row).toContain("class: 'sp-drawer-launcher-icon'");
    expect(row).toContain("class: 'sp-drawer-launcher-label'");
    expect(row).toContain("class: 'sp-drawer-launcher-desc'");
  });

  it('opens the runs panel that the hidden tab bar can no longer reach', () => {
    expect(drawerRow('sp-drawer-runs-btn')).toContain("switchTab('cloud-runs')");
    expect(panelSource).toContain('#sp-tab-bar { display: none; }');
  });

  it('tells a signed-out user to sign in instead of reporting an empty run list', async () => {
    const createClient = vi.fn();
    const result = await listChromeManagedRuns(
      {},
      { getAuthToken: async () => null, createClient },
    );

    expect(result).toEqual({
      status: 'error',
      code: 'auth_required',
      message: 'Sign in to see your AGI Cloud runs.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});
