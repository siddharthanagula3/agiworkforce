import { describe, expect, it } from 'vitest';
import {
  TIER_POLICIES,
  getTierPolicy,
  type TierCapBehavior,
  type TierPolicy,
} from '../model-catalog';

describe('TIER_POLICIES — Free chat tier', () => {
  const policy = getTierPolicy('free');

  it('does not publish the private dynamic usage ceiling', () => {
    expect(policy.tokenCapPerMonth).toBeNull();
    expect(policy.messagesPerDayCap).toBeNull();
    expect(policy.capBehavior).toBeUndefined();
  });

  it('exposes the workhorse and voice slots — no escalation/reasoning/image', () => {
    expect(policy.allowedSlots).toEqual([
      'workhorse_general',
      'voice_transcription',
      'voice_rewrite',
    ]);
  });

  it('blocks all media generation', () => {
    expect(policy.allowMediaGeneration).toBe(false);
    expect(policy.allowImageGeneration).toBe(false);
    expect(policy.allowVideoGeneration).toBe(false);
  });

  it('allows free chat tools and one custom remote MCP, but not dev-level computer use', () => {
    expect(policy.allowToolUse).toBe(true);
    expect(policy.allowMCP).toBe('one_custom_remote');
    expect(policy.allowSearch).toBe(true);
    expect(policy.allowComputerUse).toBe(false);
    expect(policy.allowManualSelection).toBe(false);
    expect(policy.manualModelSelection).toBe(false);
  });

  it('allows voice while keeping Deep Research paid', () => {
    expect(policy.allowVoice).toBe(true);
    expect(policy.allowedSlots).toContain('voice_transcription');
    expect(policy.allowedSlots).toContain('voice_rewrite');
    expect(policy.allowDeepResearch).toBe(false);
  });
});

describe('TIER_POLICIES — Pro tier compatibility policy', () => {
  const policy = getTierPolicy('pro');

  it('caps monthly text tokens at 40M', () => {
    expect(policy.tokenCapPerMonth).toBe(40_000_000);
  });

  it('exposes Auto + manual via Advanced-mode toggle (auto_plus_manual)', () => {
    expect(policy.surfacedUx).toBe('auto_plus_manual');
  });

  it('flips manualModelSelection true on both legacy and aliased fields', () => {
    expect(policy.manualModelSelection).toBe(true);
    expect(policy.allowManualSelection).toBe(true);
  });

  it('exposes Pool B workhorse + Pro `*_pro` slots + image_generation', () => {
    expect(policy.allowedSlots).toContain('workhorse_general');
    expect(policy.allowedSlots).toContain('general_balanced_pro');
    expect(policy.allowedSlots).toContain('coding_premium_pro');
    expect(policy.allowedSlots).toContain('reasoning_premium_pro');
    expect(policy.allowedSlots).toContain('multimodal_pro');
    expect(policy.allowedSlots).toContain('long_context_pro');
    expect(policy.allowedSlots).toContain('image_generation');
  });

  it('exposes browser_dom + computer_use (light) + search slots', () => {
    expect(policy.allowedSlots).toContain('browser_dom');
    expect(policy.allowedSlots).toContain('computer_use');
    expect(policy.allowedSlots).toContain('search_fast');
    expect(policy.allowedSlots).toContain('search_premium');
  });

  it('does NOT expose Hobby-pool or pre-spec slots that moved away in Task #16', () => {
    expect(policy.allowedSlots).not.toContain('general_fast');
    expect(policy.allowedSlots).not.toContain('general_balanced');
    expect(policy.allowedSlots).not.toContain('coding_fast');
    expect(policy.allowedSlots).not.toContain('coding_premium');
    expect(policy.allowedSlots).not.toContain('reasoning_premium');
    expect(policy.allowedSlots).not.toContain('creative_writing');
    expect(policy.allowedSlots).not.toContain('creative_writing_premium');
    expect(policy.allowedSlots).not.toContain('vision_fast');
    expect(policy.allowedSlots).not.toContain('vision_premium');
    expect(policy.allowedSlots).not.toContain('computer_use_premium');
  });

  it('blocks video generation (Pro+ unlock per spec §3)', () => {
    expect(policy.allowVideoGeneration).toBe(false);
  });

  it('permits image generation (no per-image cap; debits 10M-token bucket)', () => {
    expect(policy.allowMediaGeneration).toBe(true);
    expect(policy.allowImageGeneration).toBe(true);
    expect(policy.imageQuotaPerMonth).toBeNull();
    expect(policy.imageSyntheticTokenCost).toBe(50_000);
  });

  it('elevates tool use and MCP to unlimited per Round 16 tool-tier ladder', () => {
    expect(policy.allowToolUse).toBe('unlimited');
    expect(policy.allowMCP).toBe('unlimited');
  });

  it('warns at 80% and hard-caps at 100% with no grace overage', () => {
    const cap = policy.capBehavior as TierCapBehavior;
    expect(cap.warnAt).toBe(0.8);
    expect(cap.downgradeAt).toBe(1.0);
    expect(cap.hardCapAt).toBe(1.0);
  });

  it('exposes managed_cloud + BYOK provider surfaces (no local at Pro)', () => {
    expect(policy.allowedProviderSurfaces).toEqual(['managed_cloud', 'byok']);
  });

  it('permits browser DOM, computer use, and search at the policy-flag level', () => {
    expect(policy.allowBrowserDom).toBe(true);
    expect(policy.allowComputerUse).toBe(true);
    expect(policy.allowSearch).toBe(true);
  });

  it('freezes the Pro policy object (Vercel server-no-shared-module-state)', () => {
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.allowedSlots)).toBe(true);
    expect(Object.isFrozen(policy.allowedProviderSurfaces)).toBe(true);
    expect(Object.isFrozen(policy.capBehavior)).toBe(true);
  });

  it('throws when a caller tries to mutate the Pro policy in strict mode', () => {
    'use strict';
    expect(() => {
      (policy as { tokenCapPerMonth: number }).tokenCapPerMonth = 1;
    }).toThrow();
  });

  it('throws when a caller tries to mutate the Pro allowedSlots array', () => {
    'use strict';
    expect(() => {
      (policy.allowedSlots as string[]).push('rogue_slot');
    }).toThrow();
  });
});

describe('TIER_POLICIES — freeze guarantees (Vercel server-no-shared-module-state)', () => {
  it('freezes the registry root', () => {
    expect(Object.isFrozen(TIER_POLICIES)).toBe(true);
  });

  it('freezes each tier policy object', () => {
    for (const policy of Object.values(TIER_POLICIES)) {
      expect(Object.isFrozen(policy)).toBe(true);
    }
  });

  it('freezes each tier capBehavior object', () => {
    const free = TIER_POLICIES.free;
    const pro = TIER_POLICIES.pro;
    expect(free.capBehavior).toBeUndefined();
    expect(Object.isFrozen(pro.capBehavior)).toBe(true);
  });

  it('freezes the allowedSlots array on every tier so concurrent renders cannot mutate it', () => {
    for (const policy of Object.values(TIER_POLICIES)) {
      expect(Object.isFrozen(policy.allowedSlots)).toBe(true);
    }
  });

  it('throws when a caller tries to mutate a tier policy in strict mode', () => {
    'use strict';
    const free = TIER_POLICIES.free;
    expect(() => {
      (free as { tokenCapPerMonth: number }).tokenCapPerMonth = 999_999;
    }).toThrow();
  });

  it('throws when a caller tries to mutate the allowedSlots array', () => {
    'use strict';
    const pro = TIER_POLICIES.pro;
    expect(() => {
      (pro.allowedSlots as string[]).push('rogue_slot');
    }).toThrow();
  });
});

describe('getTierPolicy — public getter', () => {
  it('returns the same Free policy reference on repeated calls (no per-call allocation)', () => {
    expect(getTierPolicy('free')).toBe(TIER_POLICIES.free);
    expect(getTierPolicy('free')).toBe(getTierPolicy('free'));
  });

  it('returns the same Pro policy reference on repeated calls', () => {
    expect(getTierPolicy('pro')).toBe(TIER_POLICIES.pro);
  });

  it('maps both Max subscription products to the capped Max policy', () => {
    expect(getTierPolicy('max')).toBe(TIER_POLICIES.max);
    expect(getTierPolicy('max_15x')).toBe(TIER_POLICIES.max);
  });

  it('falls back to Free when the tier is unknown', () => {
    expect(getTierPolicy('unknown-tier')).toBe(TIER_POLICIES.free);
    expect(getTierPolicy(null)).toBe(TIER_POLICIES.free);
    expect(getTierPolicy(undefined)).toBe(TIER_POLICIES.free);
    expect(getTierPolicy('')).toBe(TIER_POLICIES.free);
  });

  it('matches the documented Free tier shape', () => {
    expect(getTierPolicy('free')).toMatchObject<Partial<TierPolicy>>({
      tier: 'free',
      tokenCapPerMonth: null,
      messagesPerDayCap: null,
      allowedSlots: ['workhorse_general', 'voice_transcription', 'voice_rewrite'],
      allowMediaGeneration: false,
      allowImageGeneration: false,
      allowVideoGeneration: false,
      allowToolUse: true,
      allowMCP: 'one_custom_remote',
      allowSearch: true,
      allowVoice: true,
      allowDeepResearch: false,
      allowComputerUse: false,
      allowManualSelection: false,
      manualModelSelection: false,
      surfacedUx: 'auto_only',
    });
  });

  it('unknown tier falls back to Free tier shape', () => {
    expect(getTierPolicy('plus')).toMatchObject<Partial<TierPolicy>>({
      tier: 'free',
      tokenCapPerMonth: null,
      allowedSlots: ['workhorse_general', 'voice_transcription', 'voice_rewrite'],
      allowMediaGeneration: false,
      allowManualSelection: false,
      manualModelSelection: false,
      surfacedUx: 'auto_only',
    });
  });
});

describe('Task #26 — TierPolicy declaration consolidation', () => {
  it('exposes the Advanced-mode manual picker for Pro on both legacy and aliased fields', () => {
    expect(getTierPolicy('pro').manualModelSelection).toBe(true);
    expect(getTierPolicy('pro').allowManualSelection).toBe(true);
  });

  it('keeps Free Auto-only while basic/hobby get the pro policy (2026-07-16 ladder)', () => {
    expect(getTierPolicy('free').manualModelSelection).toBe(false);
    expect(getTierPolicy('free').allowManualSelection).toBe(false);
    for (const alias of ['basic', 'hobby']) {
      expect(getTierPolicy(alias).tier).toBe('pro');
      expect(getTierPolicy(alias).manualModelSelection).toBe(true);
      expect(getTierPolicy(alias).allowManualSelection).toBe(true);
    }
  });
});
