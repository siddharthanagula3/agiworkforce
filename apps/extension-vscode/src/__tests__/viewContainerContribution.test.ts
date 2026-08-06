import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import manifest from '../../package.json';

/**
 * The AGI view container must live in the Activity Bar. VS Code's Secondary
 * Side Bar is collapsed by default and contributes no persistent icon, so a
 * container placed there leaves a fresh install with no discoverable way to
 * reach the chat input. 0.3.0 shipped that way; these assertions keep it from
 * regressing.
 */
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

  it('contributes the chat webview view into the activity-bar container', () => {
    const activityBarContainerId = containers.activitybar[0]?.id ?? '';
    const views = manifest.contributes.views as Record<
      string,
      Array<{ id: string; type?: string }>
    >;

    expect(views[activityBarContainerId]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agi-workforce.sidebar', type: 'webview' }),
        expect.objectContaining({ id: 'agi-workforce.conversations', type: 'tree' }),
        expect.objectContaining({ id: 'agi-workforce.contextPanel', type: 'tree' }),
      ]),
    );
    // The chat view id must match the webview view provider registered in
    // core/chatSetup.ts, otherwise the container renders an empty placeholder.
    expect(manifest.activationEvents).toContain('onView:agi-workforce.sidebar');
  });

  it('ships the container icon it references', () => {
    const icon = containers.activitybar[0]?.icon ?? '';
    expect(icon).toBe('media/icon-sidebar.svg');
    expect(fs.existsSync(path.resolve(__dirname, '../..', icon))).toBe(true);
  });

  it('supports the widest VS Code range the code is typed against', () => {
    // The 1.106 floor existed only to gate on `secondarySidebar` container
    // support. Activity-bar containers are ancient API, and @types/vscode is
    // pinned at ^1.100.0, so nothing compiled here needs a newer host.
    expect(manifest.engines.vscode).toBe('^1.100.0');
    expect(manifest.devDependencies['@types/vscode']).toBe('^1.100.0');
  });
});
