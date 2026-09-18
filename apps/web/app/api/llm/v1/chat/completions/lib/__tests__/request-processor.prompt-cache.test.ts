import { describe, expect, it } from 'vitest';

import { resolveResidencyRegion, resolveTurnPromptCache } from '../request-processor';

const TURN = {
  requested: true,
  temporaryChat: false,
  zeroDataRetentionOnly: false,
  organizationId: 'org_alpha',
  userId: 'user_alpha',
};

describe('resolveTurnPromptCache', () => {
  it('caches an ordinary turn the client asked to cache', () => {
    expect(resolveTurnPromptCache(TURN)).toEqual({
      usePromptCache: true,
      promptCacheScope: {
        organizationId: 'org_alpha',
        userId: 'user_alpha',
        privacyClass: 'standard',
      },
    });
  });

  it('refuses to cache a Temporary Chat however the client set the flag', () => {
    const resolved = resolveTurnPromptCache({ ...TURN, temporaryChat: true });

    expect(resolved.usePromptCache).toBe(false);
    expect(resolved.promptCacheScope.privacyClass).toBe('temporary');
  });

  it('refuses to cache a zero-retention workspace', () => {
    const resolved = resolveTurnPromptCache({ ...TURN, zeroDataRetentionOnly: true });

    expect(resolved.usePromptCache).toBe(false);
    expect(resolved.promptCacheScope.privacyClass).toBe('zero_retention');
  });

  it('reports Temporary Chat ahead of zero retention, the stronger of the two claims', () => {
    const resolved = resolveTurnPromptCache({
      ...TURN,
      temporaryChat: true,
      zeroDataRetentionOnly: true,
    });

    expect(resolved.promptCacheScope.privacyClass).toBe('temporary');
  });

  it('leaves caching off when the client never asked for it', () => {
    expect(resolveTurnPromptCache({ ...TURN, requested: undefined }).usePromptCache).toBe(false);
  });

  it('scopes a personal turn to its user when there is no workspace', () => {
    const resolved = resolveTurnPromptCache({ ...TURN, organizationId: null });

    expect(resolved.promptCacheScope).toMatchObject({
      organizationId: null,
      userId: 'user_alpha',
    });
  });
});

describe('resolveResidencyRegion', () => {
  it('carries a workspace pinned away from the deployment region into routing', () => {
    expect(resolveResidencyRegion('eu', 'us')).toBe('eu');
  });

  it('asks nothing of routing for a workspace in the deployment region', () => {
    expect(resolveResidencyRegion('us', 'us')).toBeNull();
  });

  it('asks nothing when the workspace region is unknown', () => {
    expect(resolveResidencyRegion(null, 'us')).toBeNull();
  });

  it('carries the workspace region when the deployment asserts none of its own', () => {
    expect(resolveResidencyRegion('eu', null)).toBe('eu');
  });
});
