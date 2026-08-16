
import {
  canAccessModelForSubscriptionTier,
  getAllowedModelsForTier,
  normalizeModelId,
} from '@agiworkforce/types';
import { getModelListForCloudAccess } from '../src/features/model-picker/service';

const TIERS = ['free', 'basic', 'pro', 'max', 'team', 'enterprise'] as const;

const ECONOMY_MODEL_IDS = new Set(getAllowedModelsForTier('economy'));

function serverAllows(modelId: string, tier: string): boolean {
  if (canAccessModelForSubscriptionTier(modelId, tier)) return true;
  const canonical = normalizeModelId(modelId) ?? modelId;
  return ECONOMY_MODEL_IDS.has(canonical);
}

describe('cloud model picker × subscription tier matrix', () => {
  const cloudModelsByTier = new Map(
    TIERS.map((tier) => [
      tier,
      getModelListForCloudAccess(true, tier).filter((m) => m.surface === 'cloud_managed'),
    ]),
  );

  it('exposes a non-empty cloud model list to gate', () => {
    for (const tier of TIERS) {
      expect(cloudModelsByTier.get(tier)!.length).toBeGreaterThan(0);
    }
  });

  for (const tier of TIERS) {
    describe(`tier: ${tier}`, () => {
      const models = cloudModelsByTier.get(tier)!;

      it('never renders a model selectable that the server would reject', () => {
        const wronglySelectable = models
          .filter((m) => m.availability === 'ready' && !serverAllows(m.id, tier))
          .map((m) => m.id);
        expect(wronglySelectable).toEqual([]);
      });

      it('never locks a model the server would serve', () => {
        const wronglyLocked = models
          .filter((m) => m.availability !== 'ready' && serverAllows(m.id, tier))
          .map((m) => m.id);
        expect(wronglyLocked).toEqual([]);
      });

      it('gives every locked row an upgrade reason (signed-in lock is never a sign-in lock)', () => {
        const badReasons = models
          .filter((m) => m.availability !== 'ready')
          .filter((m) => !m.lockReason || /sign in/i.test(m.lockReason))
          .map((m) => `${m.id}: ${m.lockReason ?? '(none)'}`);
        expect(badReasons).toEqual([]);
      });
    });
  }

  it('locks every cloud model behind sign-in when cloud access is not unlocked', () => {
    for (const tier of TIERS) {
      const lockedList = getModelListForCloudAccess(false, tier).filter(
        (m) => m.surface === 'cloud_managed',
      );
      for (const m of lockedList) {
        expect(m.availability).not.toBe('ready');
      }
    }
  });
});
