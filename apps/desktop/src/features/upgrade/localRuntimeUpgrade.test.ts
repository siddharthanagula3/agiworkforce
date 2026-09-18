import { describe, expect, it } from 'vitest';

import { updaterMayOffer, upgradeNotice, type RecoveryAction } from './localRuntimeUpgrade';

const ALL_ACTIONS: RecoveryAction[] = [
  'start',
  'rebuildRuntimeArtifacts',
  'rebuildFromCloud',
  'holdForNewerData',
];

describe('upgradeNotice', () => {
  it('says nothing when there is nothing to recover from', () => {
    expect(upgradeNotice({ action: 'start' })).toBeNull();
  });

  it('never tells the user their local-only data is at risk', () => {
    for (const action of ALL_ACTIONS) {
      const notice = upgradeNotice({ action, foundDataFormat: 2, supportedDataFormat: 1 });
      if (notice === null) continue;
      expect(notice.localDataAtRisk).toBe(false);
      expect(notice.body).not.toMatch(/delete|erase|lost/i);
    }
  });

  it('lets the app carry on while a rebuild runs, and says what is untouched', () => {
    const runtime = upgradeNotice({ action: 'rebuildRuntimeArtifacts' });
    expect(runtime?.blocking).toBe(false);
    expect(runtime?.body).toMatch(/downloaded models are untouched/i);

    const cloud = upgradeNotice({ action: 'rebuildFromCloud' });
    expect(cloud?.blocking).toBe(false);
    expect(cloud?.body).toMatch(/only on this device stays/i);
  });

  it('blocks on data a newer build wrote and names both formats', () => {
    const notice = upgradeNotice({
      action: 'holdForNewerData',
      foundDataFormat: 4,
      supportedDataFormat: 2,
    });
    expect(notice?.blocking).toBe(true);
    expect(notice?.body).toContain('format 4');
    expect(notice?.body).toContain('reads 2');
    expect(notice?.actionLabel).toBe('Get the newer version');
  });
});

describe('updaterMayOffer', () => {
  it('refuses a release that could not read the data already on disk', () => {
    expect(updaterMayOffer(2, 3)).toBe(true);
    expect(updaterMayOffer(2, 2)).toBe(true);
    expect(updaterMayOffer(3, 2)).toBe(false);
  });
});
