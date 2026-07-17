import { describe, expect, it, vi } from 'vitest';
import { purgeLegacyProviderCredentials } from '../src/features/security/legacyProviderCredentials';

describe('legacy Chrome provider credential cleanup', () => {
  it('deletes the obsolete BYOK key from every Chrome storage plane', async () => {
    const localRemove = vi.fn().mockResolvedValue(undefined);
    const sessionRemove = vi.fn().mockResolvedValue(undefined);
    const syncRemove = vi.fn().mockResolvedValue(undefined);

    const failures = await purgeLegacyProviderCredentials({
      local: { remove: localRemove },
      session: { remove: sessionRemove },
      sync: { remove: syncRemove },
    });

    expect(localRemove).toHaveBeenCalledWith('agi_api_key');
    expect(sessionRemove).toHaveBeenCalledWith('agi_api_key');
    expect(syncRemove).toHaveBeenCalledWith('agi_api_key');
    expect(failures).toEqual([]);
  });

  it('reports a failed storage plane while still clearing the others', async () => {
    const localRemove = vi.fn().mockRejectedValue(new Error('local unavailable'));
    const sessionRemove = vi.fn().mockResolvedValue(undefined);
    const syncRemove = vi.fn().mockResolvedValue(undefined);

    const failures = await purgeLegacyProviderCredentials({
      local: { remove: localRemove },
      session: { remove: sessionRemove },
      sync: { remove: syncRemove },
    });

    expect(sessionRemove).toHaveBeenCalledOnce();
    expect(syncRemove).toHaveBeenCalledOnce();
    expect(failures).toEqual(['local']);
  });
});
