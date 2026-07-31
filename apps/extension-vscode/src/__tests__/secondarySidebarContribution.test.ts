import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

describe('Secondary Side Bar contribution', () => {
  it('places the single AGI view container in the native secondary sidebar', () => {
    const containers = manifest.contributes.viewsContainers as Record<
      string,
      Array<{ id: string; title: string }>
    >;

    expect(containers.secondarySidebar).toEqual([
      expect.objectContaining({ id: 'agi-workforce-sidebar', title: 'AGI Workforce' }),
    ]);
    expect(containers.activitybar).toBeUndefined();
    expect(manifest.contributes.views['agi-workforce-sidebar']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'agi-workforce.sidebar', type: 'webview' }),
        expect.objectContaining({ id: 'agi-workforce.conversations', type: 'tree' }),
        expect.objectContaining({ id: 'agi-workforce.contextPanel', type: 'tree' }),
      ]),
    );
  });

  it('requires the first stable VS Code release that supports secondarySidebar', () => {
    expect(manifest.engines.vscode).toBe('^1.106.0');
  });
});
