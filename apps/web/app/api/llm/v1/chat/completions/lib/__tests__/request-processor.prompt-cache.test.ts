import { describe, expect, it } from 'vitest';
import {
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  splitSystemPromptCacheBoundary,
} from '@agiworkforce/provider-protocol';

import {
  placeTurnSystemNotices,
  resolveResidencyRegion,
  resolveTurnPromptCache,
  type ProcessedRequest,
} from '../request-processor';
import { REQUIRED_SEARCH_SYSTEM_NUDGE } from '@/lib/web-search/required-search';

type TurnMessages = ProcessedRequest['llmRequest']['messages'];

function message(role: TurnMessages[number]['role'], content: string): TurnMessages[number] {
  return { role, content };
}

function cachedSystemPrefix(messages: TurnMessages): string {
  const system = messages
    .filter((entry) => entry.role === 'system')
    .map((entry) => entry.content)
    .join('\n\n');
  return splitSystemPromptCacheBoundary(system)?.stablePrefix ?? system;
}

const TURN = {
  requested: true,
  surface: 'web' as const,
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

  it('caches a first-party surface whose client never sent the flag', () => {
    for (const surface of ['chrome', 'vscode', 'cli', 'mobile', 'web'] as const) {
      expect(
        resolveTurnPromptCache({ ...TURN, surface, requested: undefined }).usePromptCache,
      ).toBe(true);
    }
  });

  it('leaves caching off when a first-party client turns it off', () => {
    expect(resolveTurnPromptCache({ ...TURN, requested: false }).usePromptCache).toBe(false);
  });

  it('leaves caching off for a developer API key that never asked for it', () => {
    expect(
      resolveTurnPromptCache({ ...TURN, surface: 'api', requested: undefined }).usePromptCache,
    ).toBe(false);
    expect(
      resolveTurnPromptCache({ ...TURN, surface: 'api', requested: true }).usePromptCache,
    ).toBe(true);
  });

  it('refuses a Temporary Chat on a surface that caches by default', () => {
    expect(
      resolveTurnPromptCache({
        ...TURN,
        surface: 'chrome',
        requested: undefined,
        temporaryChat: true,
      }).usePromptCache,
    ).toBe(false);
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

describe('placeTurnSystemNotices', () => {
  const conversation = (): TurnMessages => [
    message('system', 'Capability preamble that every turn shares.'),
    message('system', 'You are a browser assistant.'),
    message('user', 'What changed in the news today?'),
  ];

  it('keeps the cached system prefix byte-identical on a turn that carries a notice', () => {
    const plain = conversation();
    const nudged = conversation();
    placeTurnSystemNotices(plain, []);
    placeTurnSystemNotices(nudged, [REQUIRED_SEARCH_SYSTEM_NUDGE]);

    expect(cachedSystemPrefix(nudged)).toBe(cachedSystemPrefix(plain));
    expect(cachedSystemPrefix(nudged)).not.toContain(REQUIRED_SEARCH_SYSTEM_NUDGE);
    expect(nudged.map((entry) => entry.role)).toEqual([
      'system',
      'system',
      'system',
      'system',
      'user',
    ]);
  });

  it('adds notices after an existing per-turn block without a second boundary', () => {
    const messages = conversation();
    messages.splice(2, 0, message('system', `${SYSTEM_PROMPT_CACHE_BOUNDARY}Recalled memory.`));
    placeTurnSystemNotices(messages, ['Notice one.', 'Notice two.']);

    const boundaries = messages.filter((entry) =>
      entry.content.includes(SYSTEM_PROMPT_CACHE_BOUNDARY),
    );
    expect(boundaries).toHaveLength(1);
    expect(messages.slice(3, 5).map((entry) => entry.content)).toEqual([
      'Notice one.',
      'Notice two.',
    ]);
    expect(messages[5]?.role).toBe('user');
  });

  it('keeps each notice a message of its own that context fitting cannot shorten', () => {
    const messages = conversation();
    placeTurnSystemNotices(messages, [REQUIRED_SEARCH_SYSTEM_NUDGE]);

    const notice = messages.find((entry) => entry.content === REQUIRED_SEARCH_SYSTEM_NUDGE);
    expect(notice?.content.startsWith(SYSTEM_PROMPT_CACHE_BOUNDARY)).toBe(false);
  });
});
