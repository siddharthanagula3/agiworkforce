import { describe, expect, it } from 'vitest';
import {
  PAYWALL_FEATURE_COPY,
  normalizePaywallFeature,
  paywallLimitHeadline,
  paywallUpgradeLabel,
  type PaywallFeature,
} from '../paywall-vocabulary';

const FEATURES = Object.keys(PAYWALL_FEATURE_COPY) as PaywallFeature[];

describe('paywall vocabulary', () => {
  it('covers the paid ceilings, not just capability gates', () => {
    // Without these the classifier collapsed a rate limit into
    // 'paid_capability', and the card told a paying subscriber their plan
    // lacked something it has.
    expect(FEATURES).toContain('rolling_capacity');
    expect(FEATURES).toContain('request_rate');
  });

  it('gives every feature an upgrade fragment that completes the sentence', () => {
    for (const feature of FEATURES) {
      const sentence = `Upgrade to Pro for ${paywallUpgradeLabel(feature)}`;
      expect(sentence).not.toMatch(/for (You|That|Upgrade)/);
      // A fragment, not a sentence: it must not start with a capital or end
      // with a full stop, or the composed line reads as two sentences jammed
      // together.
      expect(paywallUpgradeLabel(feature)).not.toMatch(/^[A-Z][a-z]+ (have|are|is)\b/);
      expect(paywallUpgradeLabel(feature).endsWith('.')).toBe(false);
    }
  });

  it('gives every feature a headline that stands alone', () => {
    for (const feature of FEATURES) {
      const headline = paywallLimitHeadline(feature);
      expect(headline[0]).toBe(headline[0]?.toUpperCase());
      expect(headline.split(' ').length).toBeGreaterThan(3);
    }
  });

  it('never reuses the upgrade fragment as the standalone headline', () => {
    // "You have hit a higher request rate" was the bug: the fragment reads as
    // the opposite of what happened when it is promoted to a headline.
    for (const feature of FEATURES) {
      expect(paywallLimitHeadline(feature)).not.toBe(paywallUpgradeLabel(feature));
    }
  });

  it('degrades an unknown server feature instead of blanking the card', () => {
    // A server shipping a new classification ahead of the clients must not
    // produce an empty headline.
    expect(normalizePaywallFeature('feature_from_a_newer_server')).toBe('paid_capability');
    expect(paywallUpgradeLabel('feature_from_a_newer_server')).toBe('this capability');
    expect(paywallLimitHeadline('feature_from_a_newer_server')).toBe(
      'You have reached a plan limit',
    );
  });

  it('passes through a known feature unchanged', () => {
    expect(normalizePaywallFeature('web_search')).toBe('web_search');
    expect(paywallUpgradeLabel('video_generation')).toBe('video generation');
  });

  it('describes the token ceiling as usage, matching the meters', () => {
    // The two cards disagreed here: "higher token limits" vs "higher usage
    // limits". Usage wins because that is what every meter is labelled.
    expect(paywallUpgradeLabel('token_cap')).toBe('higher usage limits');
    expect(paywallUpgradeLabel('token_cap')).not.toContain('token');
  });
});
