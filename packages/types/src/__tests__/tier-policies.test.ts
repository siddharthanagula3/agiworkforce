/**
 * Tier-policy registry tests — covers Free + Hobby per the auto-routing spec
 * freeze on 2026-05-07 (`tasks/auto-routing-spec.md` §1, §3, §6).
 *
 * The shape and freeze guarantees are load-bearing for billing and routing,
 * so failures here should fail CI.
 */
import { describe, expect, it } from 'vitest';
import {
  TIER_POLICIES,
  getTierPolicy,
  type TierCapBehavior,
  type TierPolicy,
} from '../model-catalog';

describe('TIER_POLICIES — Free tier (auto-routing-spec §1)', () => {
  const policy = getTierPolicy('free');

  it('caps monthly text tokens at 100K', () => {
    expect(policy.tokenCapPerMonth).toBe(100_000);
  });

  it('caps daily messages at 5', () => {
    expect(policy.messagesPerDayCap).toBe(5);
  });

  it('exposes only the workhorse_general slot — no escalation/reasoning/image', () => {
    expect(policy.allowedSlots).toEqual(['workhorse_general']);
  });

  it('blocks all media generation', () => {
    expect(policy.allowMediaGeneration).toBe(false);
    expect(policy.allowImageGeneration).toBe(false);
    expect(policy.allowVideoGeneration).toBe(false);
  });

  it('blocks tool use, MCP, computer use, and manual model selection', () => {
    expect(policy.allowToolUse).toBe(false);
    expect(policy.allowMCP).toBe(false);
    expect(policy.allowComputerUse).toBe(false);
    expect(policy.allowManualSelection).toBe(false);
    expect(policy.manualModelSelection).toBe(false);
  });

  it('warns at 80%, downgrades at 100%, hard-caps at 150%', () => {
    const cap = policy.capBehavior as TierCapBehavior;
    expect(cap.warnAt).toBe(0.8);
    expect(cap.downgradeAt).toBe(1.0);
    expect(cap.hardCapAt).toBe(1.5);
  });
});

describe('TIER_POLICIES — Hobby tier (auto-routing-spec §1)', () => {
  const policy = getTierPolicy('hobby');

  it('caps monthly text tokens at 2M', () => {
    expect(policy.tokenCapPerMonth).toBe(2_000_000);
  });

  it('exposes workhorse + escalation_coding + reasoning_premium + image_generation', () => {
    expect(policy.allowedSlots).toEqual([
      'workhorse_general',
      'escalation_coding',
      'reasoning_premium',
      'image_generation',
    ]);
  });

  it('permits image generation (10/mo) but not video', () => {
    expect(policy.allowMediaGeneration).toBe(true);
    expect(policy.allowImageGeneration).toBe(true);
    expect(policy.allowVideoGeneration).toBe(false);
    expect(policy.imageQuotaPerMonth).toBe(10);
  });

  it('charges 50K synthetic tokens per generated image', () => {
    expect(policy.imageSyntheticTokenCost).toBe(50_000);
  });

  it('permits web search and basic MCP with burn warnings', () => {
    expect(policy.allowToolUse).toBe('web_search_with_burn_warning');
    expect(policy.allowMCP).toBe('basic_with_burn_warning');
  });

  it('blocks computer use and manual model selection (Auto-only tier)', () => {
    expect(policy.allowComputerUse).toBe(false);
    expect(policy.allowManualSelection).toBe(false);
    expect(policy.manualModelSelection).toBe(false);
    expect(policy.surfacedUx).toBe('auto_only');
  });

  it('warns at 80%, downgrades at 100%, hard-caps at 150%', () => {
    const cap = policy.capBehavior as TierCapBehavior;
    expect(cap.warnAt).toBe(0.8);
    expect(cap.downgradeAt).toBe(1.0);
    expect(cap.hardCapAt).toBe(1.5);
  });
});

describe('TIER_POLICIES — Pro tier (parallel-spinning-hedgehog §3, §4, §6)', () => {
  const policy = getTierPolicy('pro');

  it('caps monthly text tokens at 10M', () => {
    expect(policy.tokenCapPerMonth).toBe(10_000_000);
  });

  it('exposes Auto + manual via Advanced-mode toggle (auto_plus_manual)', () => {
    expect(policy.surfacedUx).toBe('auto_plus_manual');
  });

  it('flips manualModelSelection true on both legacy and aliased fields', () => {
    expect(policy.manualModelSelection).toBe(true);
    expect(policy.allowManualSelection).toBe(true);
  });

  it('exposes Pool B workhorse + Pro `*_pro` slots + image_generation', () => {
    // Spec §3 + §4 — Pro consumes its own *_pro slots plus the workhorse for
    // 100% downgrade fallback and shared image_generation.
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
    // Round 14 dropped voice slots — no voice in v1.
    expect(policy.allowedSlots).not.toContain('voice_transcription');
    expect(policy.allowedSlots).not.toContain('voice_rewrite');
    // Pool B Hobby slots replaced by *_pro counterparts.
    expect(policy.allowedSlots).not.toContain('general_fast');
    expect(policy.allowedSlots).not.toContain('general_balanced');
    expect(policy.allowedSlots).not.toContain('coding_fast');
    expect(policy.allowedSlots).not.toContain('coding_premium');
    // Hobby-pool reasoning_premium (DeepSeek) — Pro now uses Kimi K2.6 via
    // reasoning_premium_pro.
    expect(policy.allowedSlots).not.toContain('reasoning_premium');
    // Creative writing folded into general_balanced_pro per spec.
    expect(policy.allowedSlots).not.toContain('creative_writing');
    expect(policy.allowedSlots).not.toContain('creative_writing_premium');
    // Vision folded into multimodal_pro.
    expect(policy.allowedSlots).not.toContain('vision_fast');
    expect(policy.allowedSlots).not.toContain('vision_premium');
    // Premium CU is a Pro+ unlock; Pro keeps light CU only.
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

  it('warns at 80%, downgrades at 100%, hard-caps at 150%', () => {
    const cap = policy.capBehavior as TierCapBehavior;
    expect(cap.warnAt).toBe(0.8);
    expect(cap.downgradeAt).toBe(1.0);
    expect(cap.hardCapAt).toBe(1.5);
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
    const hobby = TIER_POLICIES.hobby;
    expect(Object.isFrozen(free.capBehavior)).toBe(true);
    expect(Object.isFrozen(hobby.capBehavior)).toBe(true);
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
      // Cast to a writable shape to bypass the readonly compile-time guard;
      // the runtime freeze should still throw.
      (free as { tokenCapPerMonth: number }).tokenCapPerMonth = 999_999;
    }).toThrow();
  });

  it('throws when a caller tries to mutate the allowedSlots array', () => {
    'use strict';
    const hobby = TIER_POLICIES.hobby;
    expect(() => {
      (hobby.allowedSlots as string[]).push('rogue_slot');
    }).toThrow();
  });
});

describe('getTierPolicy — public getter', () => {
  it('returns the same Free policy reference on repeated calls (no per-call allocation)', () => {
    expect(getTierPolicy('free')).toBe(TIER_POLICIES.free);
    expect(getTierPolicy('free')).toBe(getTierPolicy('free'));
  });

  it('returns the same Hobby policy reference on repeated calls', () => {
    expect(getTierPolicy('hobby')).toBe(TIER_POLICIES.hobby);
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
      tokenCapPerMonth: 100_000,
      messagesPerDayCap: 5,
      allowedSlots: ['workhorse_general'],
      allowMediaGeneration: false,
      allowImageGeneration: false,
      allowVideoGeneration: false,
      allowToolUse: false,
      allowMCP: false,
      allowComputerUse: false,
      allowManualSelection: false,
      manualModelSelection: false,
      surfacedUx: 'auto_only',
      capBehavior: { warnAt: 0.8, downgradeAt: 1.0, hardCapAt: 1.5 },
    });
  });

  it('matches the documented Hobby tier shape', () => {
    expect(getTierPolicy('hobby')).toMatchObject<Partial<TierPolicy>>({
      tier: 'hobby',
      tokenCapPerMonth: 2_000_000,
      allowedSlots: [
        'workhorse_general',
        'escalation_coding',
        'reasoning_premium',
        'image_generation',
      ],
      allowMediaGeneration: true,
      allowImageGeneration: true,
      allowVideoGeneration: false,
      imageQuotaPerMonth: 10,
      imageSyntheticTokenCost: 50_000,
      allowToolUse: 'web_search_with_burn_warning',
      allowMCP: 'basic_with_burn_warning',
      allowComputerUse: false,
      allowManualSelection: false,
      manualModelSelection: false,
      surfacedUx: 'auto_only',
      capBehavior: { warnAt: 0.8, downgradeAt: 1.0, hardCapAt: 1.5 },
    });
  });
});

describe('Task #26 — TierPolicy declaration consolidation', () => {
  // Regression guard: the Phase-0 TierPolicy interface was missing the
  // Phase-1 spec fields (tokenCapPerMonth, capBehavior, allowManualSelection,
  // allowImageGeneration, etc). Before consolidation, TypeScript resolved the
  // legacy shape first and consumers like `assertQuota` saw `manualModelSelection`
  // as `false` for Pro — locking paying users out of the Advanced-mode toggle
  // they were entitled to. These two invariants encode the fix.
  it('exposes the Advanced-mode manual picker for Pro on both legacy and aliased fields', () => {
    expect(getTierPolicy('pro').manualModelSelection).toBe(true);
    expect(getTierPolicy('pro').allowManualSelection).toBe(true);
  });

  it('keeps Free + Hobby Auto-only on both legacy and aliased fields', () => {
    expect(getTierPolicy('free').manualModelSelection).toBe(false);
    expect(getTierPolicy('free').allowManualSelection).toBe(false);
    expect(getTierPolicy('hobby').manualModelSelection).toBe(false);
    expect(getTierPolicy('hobby').allowManualSelection).toBe(false);
  });
});
