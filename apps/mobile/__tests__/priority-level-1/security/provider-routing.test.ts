/**
 * L1 Security — Provider Routing (metadata-driven, no hardcoded model IDs)
 *
 * Mobile resolves models from the embedded catalog (features/model-picker/
 * service). Cloud-managed models are invite-locked: they must not be
 * selectable without an explicit Cloud unlock. These tests exercise the REAL
 * catalog + access predicates so a routing regression (e.g. a cloud model
 * becoming selectable for a local user) fails the build.
 */
import {
  CLOUD_LOCK_REASON,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_LIST,
  LOCKED_CLOUD_MODELS,
  getDefaultSelectableModelId,
  getModelById,
  isCloudManagedModelId,
  isSelectableModelId,
  isSelectableModelIdForCloudAccess,
} from '@/src/features/model-picker/service';

describe('L1 Security - Provider Routing (No Hardcoding)', () => {
  test('SECURITY: model IDs resolve from the catalog, not string literals', () => {
    // Pull an id from the catalog itself rather than hardcoding one.
    const local = LOCAL_MODEL_LIST[0];
    expect(local).toBeDefined();
    const resolved = getModelById(local.id);
    expect(resolved?.id).toBe(local.id);
    expect(resolved?.surface).toBe('local');
  });

  test('SECURITY: cloud-managed models are NOT selectable without Cloud unlock', () => {
    expect(LOCKED_CLOUD_MODELS.length).toBeGreaterThan(0);
    for (const cloud of LOCKED_CLOUD_MODELS) {
      expect(isCloudManagedModelId(cloud.id)).toBe(true);
      expect(isSelectableModelId(cloud.id)).toBe(false);
      expect(isSelectableModelIdForCloudAccess(cloud.id, false)).toBe(false);
    }
  });

  test('SECURITY: cloud-managed models become selectable only when explicitly unlocked', () => {
    const cloud = LOCKED_CLOUD_MODELS[0];
    expect(isSelectableModelIdForCloudAccess(cloud.id, true)).toBe(true);
  });

  test('SECURITY: locked cloud models carry the sign-in lock reason', () => {
    const cloud = LOCKED_CLOUD_MODELS[0];
    const def = getModelById(cloud.id);
    expect(def?.availability).toBe('locked');
    expect(def?.lockReason).toBe(CLOUD_LOCK_REASON);
  });

  test('SECURITY: unknown/invalid model id falls back to a safe local default', () => {
    expect(isSelectableModelId('non-existent-model')).toBe(false);
    expect(getDefaultSelectableModelId('non-existent-model')).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(isSelectableModelId(DEFAULT_LOCAL_MODEL_ID)).toBe(true);
  });
});
