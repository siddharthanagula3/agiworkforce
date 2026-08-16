export const LEGACY_PROVIDER_API_KEY = 'agi_api_key';

interface RemovableStorageArea {
  remove(keys: string | string[]): Promise<void> | void;
}

export interface LegacyProviderCredentialStorage {
  local: RemovableStorageArea;
  session: RemovableStorageArea;
  sync: RemovableStorageArea;
}

export async function purgeLegacyProviderCredentials(
  storage: LegacyProviderCredentialStorage,
): Promise<Array<keyof LegacyProviderCredentialStorage>> {
  const areas = ['local', 'session', 'sync'] as const;
  const outcomes = await Promise.allSettled(
    areas.map((area) => Promise.resolve(storage[area].remove(LEGACY_PROVIDER_API_KEY))),
  );

  return areas.filter((_, index) => outcomes[index]?.status === 'rejected');
}
