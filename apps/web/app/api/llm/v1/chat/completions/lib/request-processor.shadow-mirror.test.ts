import { describe, expect, it } from 'vitest';

import { resolvePromptCachePrivacyClass } from '@agiworkforce/types';

import { resolveTurnPromptCache, turnMayBeShadowMirrored } from './request-processor';

const USER = { organizationId: 'org-1', userId: 'user-1' };

describe('turnMayBeShadowMirrored', () => {
  it('mirrors an ordinary turn', () => {
    expect(turnMayBeShadowMirrored({ temporaryChat: false, zeroDataRetentionOnly: false })).toBe(
      true,
    );
  });

  it('refuses a Temporary Chat, whose messages are not supposed to outlive the turn', () => {
    expect(turnMayBeShadowMirrored({ temporaryChat: true, zeroDataRetentionOnly: false })).toBe(
      false,
    );
  });

  it('refuses a zero-retention workspace, which promised the provider keeps nothing', () => {
    expect(turnMayBeShadowMirrored({ temporaryChat: false, zeroDataRetentionOnly: true })).toBe(
      false,
    );
  });

  it('refuses when both hold', () => {
    expect(turnMayBeShadowMirrored({ temporaryChat: true, zeroDataRetentionOnly: true })).toBe(
      false,
    );
  });

  it('answers on the privacy class the prompt cache already refuses on, not a second rule', () => {
    for (const temporaryChat of [false, true]) {
      for (const zeroDataRetentionOnly of [false, true]) {
        const privacyClass = resolvePromptCachePrivacyClass({
          temporaryChat,
          zeroDataRetentionOnly,
        });
        const cache = resolveTurnPromptCache({
          requested: true,
          temporaryChat,
          zeroDataRetentionOnly,
          ...USER,
        });

        expect(turnMayBeShadowMirrored({ temporaryChat, zeroDataRetentionOnly })).toBe(
          privacyClass === 'standard',
        );
        expect(turnMayBeShadowMirrored({ temporaryChat, zeroDataRetentionOnly })).toBe(
          cache.usePromptCache,
        );
      }
    }
  });
});
