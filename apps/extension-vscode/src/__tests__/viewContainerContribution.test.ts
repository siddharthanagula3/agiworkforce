import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import manifest from '../../package.json';

describe('view container contribution', () => {
  const containers = manifest.contributes.viewsContainers as Record<
    string,
    Array<{ id: string; title: string; icon: string }>
  >;

  it('places the single AGI view container in the activity bar', () => {
    expect(containers.activitybar).toEqual([
      expect.objectContaining({ id: 'agi-workforce-sidebar', title: 'AGI Workforce' }),
    ]);
    expect(containers.secondarySidebar).toBeUndefined();
  });

  it('contributes exactly one view, the chat webview', () => {
    const activityBarContainerId = containers.activitybar[0]?.id ?? '';
    const views = manifest.contributes.views as Record<
      string,
      Array<{ id: string; type?: string }>
    >;

    expect(views[activityBarContainerId]).toEqual([
      expect.objectContaining({ id: 'agi-workforce.sidebar', type: 'webview' }),
    ]);
    expect(manifest.activationEvents).toContain('onView:agi-workforce.sidebar');
  });

  it('keeps no tree view menus once the trees are gone', () => {
    const menus = manifest.contributes.menus as Record<string, Array<{ when?: string }>>;
    expect(menus['view/item/context']).toBeUndefined();
    expect(menus['view/title']).toEqual([
      expect.objectContaining({ when: 'view == agi-workforce.sidebar' }),
    ]);
    expect('viewsWelcome' in manifest.contributes).toBe(false);
  });

  it('ships the container icon it references', () => {
    const icon = containers.activitybar[0]?.icon ?? '';
    expect(icon).toBe('media/icon-sidebar.svg');
    expect(fs.existsSync(path.resolve(__dirname, '../..', icon))).toBe(true);
  });

  it('supports the widest VS Code range the code is typed against', () => {
    expect(manifest.engines.vscode).toBe('^1.100.0');
    expect(manifest.devDependencies['@types/vscode']).toBe('^1.100.0');
  });
});
