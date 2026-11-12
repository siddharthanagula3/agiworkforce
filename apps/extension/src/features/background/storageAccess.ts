export const TRUSTED_ONLY_STORAGE_AREAS = ['local', 'session', 'sync', 'managed'] as const;

export type TrustedOnlyStorageArea = (typeof TRUSTED_ONLY_STORAGE_AREAS)[number];

export type StorageAccessLevelAreas = Record<
  TrustedOnlyStorageArea,
  Pick<chrome.storage.StorageArea, 'setAccessLevel'>
>;

export async function restrictStorageToTrustedContexts(
  storage: StorageAccessLevelAreas,
  onFailure: (area: TrustedOnlyStorageArea, error: unknown) => void,
): Promise<void> {
  await Promise.all(
    TRUSTED_ONLY_STORAGE_AREAS.map(async (area) => {
      try {
        await storage[area].setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      } catch (error) {
        onFailure(area, error);
      }
    }),
  );
}
