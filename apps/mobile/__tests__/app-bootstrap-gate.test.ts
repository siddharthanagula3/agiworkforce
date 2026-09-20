import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_LAYOUT = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

// Each stage's behaviour is proved by the test named beside it; this file only
// proves the launch path still calls it.
const BOOTSTRAP_STAGES: ReadonlyArray<{
  stage: string;
  entryPoint: RegExp;
  behaviour: string;
  source?: string;
}> = [
  {
    stage: 'splash',
    entryPoint: /\bholdLaunchSplash\(\)[\s\S]*\buseLaunchSplashRelease\(/,
    behaviour: '__tests__/launch-splash-release.test.tsx',
  },
  {
    stage: 'encrypted storage',
    entryPoint: /\binitMmkvEncryption\(\)/,
    behaviour: '__tests__/storage-encryption.test.ts',
  },
  {
    stage: 'auth state resolution',
    entryPoint: /\bresolveRootRedirect\(/,
    behaviour: '__tests__/root-routing.test.ts',
  },
  {
    stage: 'workspace resolution',
    entryPoint: /\bstartCloudSyncLoop\(\)/,
    behaviour: '__tests__/workspace-service.test.ts',
  },
  {
    stage: 'entitlement fetch',
    entryPoint: /\brefreshTier\(\)/,
    behaviour: '__tests__/tier-store.test.ts',
  },
  {
    stage: 'remote config',
    entryPoint: /\brefreshRolloutRings\(\)/,
    behaviour: 'src/features/rollout/rollout.test.ts',
  },
  {
    stage: 'model catalog',
    // The selection survives a cold launch as soon as encrypted storage opens,
    // which the store arranges itself rather than through the root layout.
    source: 'src/features/model-picker/store.ts',
    entryPoint: /rehydrateWhenMmkvReady\(useModelStore, 'model-store'\)/,
    behaviour: '__tests__/model-store.test.tsx',
  },
  {
    stage: 'app shell',
    entryPoint: /<Slot\s*\/>/,
    behaviour: '__tests__/drawer-route-contract.test.ts',
  },
];

describe('the launch path', () => {
  it.each(BOOTSTRAP_STAGES)('resolves $stage before handing over', ({ entryPoint, source }) => {
    const text =
      source === undefined ? ROOT_LAYOUT : readFileSync(join(__dirname, '..', source), 'utf8');

    expect(text).toMatch(entryPoint);
  });

  it('holds the launch image until storage and fonts have both settled', () => {
    expect(ROOT_LAYOUT).toMatch(
      /useLaunchSplashRelease\(\s*storageStatus !== 'pending' && \(fontsLoaded \|\| fontError !== null\)\s*\)/,
    );
  });

  it('names a behavioural test for every stage it gates on', () => {
    expect(BOOTSTRAP_STAGES.length).toBeGreaterThanOrEqual(8);
    for (const { behaviour } of BOOTSTRAP_STAGES) {
      expect(() => readFileSync(join(__dirname, '..', behaviour), 'utf8')).not.toThrow();
    }
  });
});
