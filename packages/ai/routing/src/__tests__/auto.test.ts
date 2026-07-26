import { describe, expect, it } from 'vitest';
import {
  buildEffectiveCapabilityDocument,
  getAllowedModelsForTier,
  type PlatformCapability,
} from '@agiworkforce/types';
import { resolveAutoRoute } from '../auto';

describe('resolveAutoRoute', () => {
  it('honors the requested economy profile even when the tier allows premium', () => {
    const result = resolveAutoRoute({
      selection: 'auto-economy',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.5-flash-lite',
      requestedProfile: 'economy',
      effectiveProfile: 'economy',
      reason: 'preferred_slot',
    });
  });

  it('single Auto routes a trivial chat to the economy band even on a premium tier', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'simple_chat',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.5-flash-lite',
      requestedProfile: 'economy',
      effectiveProfile: 'economy',
    });
  });

  it('single Auto routes a hard coding task to the premium band on a max tier', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-5',
      requestedProfile: 'premium',
      effectiveProfile: 'premium',
    });
  });

  it('single Auto clamps its computed premium band to the free tier maximum', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'free',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gpt-5.4-mini',
      requestedProfile: 'premium',
      effectiveProfile: 'economy',
    });
  });

  it('single Auto falls back to the static balanced band for an unmapped task', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'general',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      requestedProfile: 'balanced',
      effectiveProfile: 'balanced',
    });
  });

  it('affordability: skips the flagship the budget cannot cover and picks the best affordable slot', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      budgetRemainingCents: 2.0, // opus ~3.0c unaffordable; sonnet ~1.8c fits
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-sonnet-5',
      effectiveProfile: 'premium',
    });
  });

  it('affordability: keeps falling to a cheaper slot as the budget tightens', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      budgetRemainingCents: 1.0, // opus ~3.0c and sonnet ~1.8c unaffordable; glm ~0.58c fits
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({ status: 'selected', modelKey: 'glm-5.2' });
  });

  it('affordability: a nearly-exhausted budget still reaches the workhorse fallback (reservation is the hard gate)', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      budgetRemainingCents: 0.1, // nothing in the premium coding band fits
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({ status: 'selected', modelKey: 'gemini-3.5-flash-lite' });
  });

  it('affordability: no budget signal leaves routing unchanged (bias is a no-op off web)', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({ status: 'selected', modelKey: 'claude-opus-5' });
  });

  it('clamps premium Auto to the tier maximum profile', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'free',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gpt-5.4-mini',
      requestedProfile: 'premium',
      effectiveProfile: 'economy',
      reason: 'preferred_slot',
    });
  });

  it('uses the premium coding slot when the tier permits it', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-5',
      effectiveProfile: 'premium',
      fallbacks: [
        {
          modelKey: 'glm-5.2',
          provider: 'zhipu',
          harnessId: 'zhipu/chat-completions',
        },
        {
          modelKey: 'gemini-3.5-flash-lite',
          provider: 'google',
          harnessId: 'google/generate-content',
        },
      ],
    });
  });

  it('uses the provider-native premium research route without a duplicate fallback', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.6-flash',
      fallbacks: [],
    });
  });

  it('applies provider-exclusion overlays without hardcoded model substitutions', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'reasoning',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      usOnly: true,
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gpt-5.6-sol',
      provider: 'openai',
    });
  });

  it('keeps basic on the shared Free/Basic model pool', () => {
    const args = {
      selection: 'auto-balanced',
      taskType: 'reasoning',
      trustMode: 'managed_cloud',
    } as const;
    const asBasic = resolveAutoRoute({ ...args, subscriptionTier: 'basic' });
    const asFree = resolveAutoRoute({ ...args, subscriptionTier: 'free' });

    expect(asBasic).toEqual(asFree);
  });

  it('admits Max 15x exactly like Max for Auto routing', () => {
    const args = {
      selection: 'auto',
      taskType: 'coding',
      trustMode: 'managed_cloud',
    } as const;

    expect(resolveAutoRoute({ ...args, subscriptionTier: 'max_15x' })).toEqual(
      resolveAutoRoute({ ...args, subscriptionTier: 'max' }),
    );
  });

  it('routes free-tier reasoning to an eligible economy reasoning model', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'reasoning',
      subscriptionTier: 'free',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-haiku-4.5',
      effectiveProfile: 'economy',
    });
  });

  it('never resolves a flagship model for pro or basic (flagship is max/enterprise only)', () => {
    const flagship = new Set(
      getAllowedModelsForTier('flagship_additions').map((id) => id.toLowerCase()),
    );
    expect(flagship.size).toBeGreaterThan(0);
    for (const subscriptionTier of ['pro', 'basic'] as const) {
      for (const selection of ['auto', 'auto-balanced', 'auto-max'] as const) {
        for (const taskType of ['reasoning', 'coding', 'chat'] as const) {
          const result = resolveAutoRoute({
            selection,
            taskType,
            subscriptionTier,
            trustMode: 'managed_cloud',
          });
          // Either the profile is refused outright (auto-max is not admitted
          // for pro-class tiers — it fails closed, never downgrades to a
          // flagship route) or the resolved chain is flagship-free.
          if (result.status === 'selected') {
            expect(flagship.has(result.modelKey.toLowerCase())).toBe(false);
            for (const fallback of result.fallbacks ?? []) {
              expect(flagship.has(fallback.modelKey.toLowerCase())).toBe(false);
            }
          }
        }
      }
    }

    // And the fail-closed half explicitly: pro-class tiers cannot invoke the
    // premium profile at all.
    const denied = resolveAutoRoute({
      selection: 'auto-max',
      taskType: 'reasoning',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
    });
    expect(denied.status).toBe('unavailable');
  });

  it('ignores a provider overlay when the subscription tier does not permit it', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'reasoning',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      usOnly: true,
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'qwen-3.7-plus',
      provider: 'qwen',
    });
  });

  it('routes image generation by intrinsic output capability', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'image_generation',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.1-flash-image',
      harnessId: 'google/media',
    });
  });

  it('falls back from an explicit text model to Auto for a specialist capability when authorized', () => {
    const result = resolveAutoRoute({
      selection: 'gpt-5.6-luna',
      taskType: 'image_generation',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'mobile/cloud-chat',
      fallbackToAutoForCapabilityMismatch: true,
    });

    expect(result).toMatchObject({
      status: 'selected',
      requestedSelection: 'gpt-5.6-luna',
      modelKey: 'gemini-3.1-flash-image',
      harnessId: 'google/media',
      reason: 'capability_fallback',
    });
  });

  it('does not silently replace an explicit model unless capability fallback is authorized', () => {
    const result = resolveAutoRoute({
      selection: 'gpt-5.6-luna',
      taskType: 'image_generation',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'mobile/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'explicit_model_ineligible',
    });
  });

  it('preserves an explicit eligible model instead of silently switching providers', () => {
    const result = resolveAutoRoute({
      selection: 'gpt-5.6-luna',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gpt-5.6-luna',
      harnessId: 'openai/responses',
      reason: 'explicit',
      fallbacks: [],
    });
  });

  it('fails closed rather than crossing into cloud from a local trust boundary', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'local',
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'no_eligible_route',
    });
  });

  it('selects the catalog native-search route when its web-search harness is implemented', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.6-flash',
      harnessId: 'google/generate-content',
      reason: 'preferred_slot',
    });
  });

  it('accepts GA models when the calling runtime supports their harness', () => {
    const result = resolveAutoRoute({
      selection: 'gpt-5.6-sol',
      taskType: 'reasoning',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gpt-5.6-sol',
      provider: 'openai',
      reason: 'explicit',
    });
  });

  it('rejects routes whose harness is not executable on the calling runtime', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'image_generation',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      allowedHarnessIds: ['openai/responses', 'anthropic/messages'],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'no_eligible_route',
    });
    if (result.status === 'unavailable') {
      expect(result.reasons.some((reason) => reason.includes('google/media'))).toBe(true);
    }
  });

  it('does not apply managed subscription clamps to BYOK routing', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'byok',
      trustMode: 'byok',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-5',
      effectiveProfile: 'premium',
    });
  });

  it('derives executable harnesses from the calling runtime profile', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'byok',
      trustMode: 'byok',
      runtimeProfileId: 'cli/byok-chat',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-5',
      harnessId: 'anthropic/messages',
    });
  });

  it('admits Desktop managed Cloud after the DCL-4 runtime cutover', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'desktop/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gpt-5.6-terra',
      harnessId: 'openai/responses',
    });
  });

  it('fails closed when the runtime profile trust mode differs from the request', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'cli/byok-chat',
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'runtime_profile_mismatch',
    });
  });

  it('admits server-side web search only for a runtime profile that implements it', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.6-flash',
      harnessId: 'google/generate-content',
    });
  });

  it('admits AGI Work when the Web runtime executes platform tool discovery', () => {
    const result = resolveAutoRoute({
      selection: 'minimax-m3',
      taskType: 'agentic',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'minimax-m3',
      harnessId: 'minimax/chat-completions',
    });
  });

  it('admits Mobile research through its verified server-side search path', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'mobile/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.6-flash',
      harnessId: 'google/generate-content',
    });
  });

  it('preserves the current route across a task pivot when it remains a preferred slot', () => {
    const result = resolveAutoRoute({
      selection: 'auto-economy',
      taskType: 'coding',
      previousTaskType: 'simple_chat',
      currentModelKey: 'gemini-3.5-flash-lite',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.5-flash-lite',
      reason: 'continuity',
    });
  });

  it('reroutes on a task pivot when the current model is not preferred for the new task', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      previousTaskType: 'general',
      currentModelKey: 'gpt-5.6-terra',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.6-flash',
      reason: 'preferred_slot',
    });
  });
});

describe('resolveAutoRoute session capability admission (capability-handshake integration)', () => {
  /**
   * Session document where model/surface/settings grant both ids but the
   * TIER layer withholds `canUseDeepResearch` — the four-layer intersection
   * denies it with layer provenance, while `canUseWebSearch` stays granted.
   */
  function sessionDocument() {
    return buildEffectiveCapabilityDocument({
      sessionId: 'sess_routing',
      version: 'v1#test',
      computedAt: '2026-07-17T00:00:00.000Z',
      layers: {
        model: {
          layer: 'model',
          sourceId: 'models.json@test',
          granted: new Set<PlatformCapability>(['canUseWebSearch', 'canUseDeepResearch']),
        },
        tier: {
          layer: 'tier',
          sourceId: 'tier:pro',
          granted: new Set<PlatformCapability>(['canUseWebSearch']),
        },
        surface: {
          layer: 'surface',
          sourceId: 'surface:web',
          granted: new Set<PlatformCapability>(['canUseWebSearch', 'canUseDeepResearch']),
        },
        settings: {
          layer: 'settings',
          sourceId: 'settings:none-configured',
          granted: new Set<PlatformCapability>(['canUseWebSearch', 'canUseDeepResearch']),
        },
      },
    });
  }

  it('selects normally when the session document grants every mandatory requirement', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityDocument: sessionDocument(),
      capabilityRequirements: [{ capabilityId: 'canUseWebSearch', strength: 'mandatory' }],
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-5',
      effectiveProfile: 'premium',
    });
  });

  it('refuses the whole resolution when a tier-admissible slot exists but a mandatory capability is session-denied (tier+capability compose)', () => {
    // Identical request to the passing premium-coding selection above —
    // the ONLY difference is the session-mandatory requirement the
    // document's tier layer withholds. The model cannot weaken it.
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityDocument: sessionDocument(),
      capabilityRequirements: [
        {
          capabilityId: 'canUseDeepResearch',
          strength: 'mandatory',
          reason: 'task requires deep research',
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'mandatory_capability_unavailable',
      taskType: 'coding',
    });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.reasons[0]).toContain('canUseDeepResearch');
    expect(result.reasons[0]).toContain('tier');
    expect(result.reasons[0]).toContain('task requires deep research');
  });

  it('fails closed when mandatory requirements are declared without a session document', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityRequirements: [{ capabilityId: 'canUseWebSearch', strength: 'mandatory' }],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'mandatory_capability_unavailable',
    });
    if (result.status !== 'unavailable') throw new Error('expected unavailable');
    expect(result.reasons[0]).toContain('no session capability document');
  });

  it('never blocks on optional requirements — denied-or-undocumented optionals still select', () => {
    const deniedOptional = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityDocument: sessionDocument(),
      capabilityRequirements: [{ capabilityId: 'canUseDeepResearch', strength: 'optional' }],
    });
    expect(deniedOptional).toMatchObject({ status: 'selected', modelKey: 'claude-opus-5' });

    const optionalWithoutDocument = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityRequirements: [{ capabilityId: 'canUseWebSearch', strength: 'optional' }],
    });
    expect(optionalWithoutDocument).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-5',
    });
  });
});
