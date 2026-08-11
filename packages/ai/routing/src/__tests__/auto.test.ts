import { describe, expect, it } from 'vitest';
import {
  buildEffectiveCapabilityDocument,
  getAllowedModelsForTier,
  getModelMetadataById,
  getRoutingSlotModel,
  getTaskModelForProvider,
  requireProviderDefaultModel,
  resolveEffectiveModelPricingForInputTokens,
  type PlatformCapability,
} from '@agiworkforce/types';
import { resolveAutoRoute } from '../auto';

const FAST_MODEL_ID = getRoutingSlotModel('workhorse_general');
const CODING_PREMIUM_MODEL_ID = getRoutingSlotModel('flagship_coding');
const CODING_BALANCED_MODEL_ID = getRoutingSlotModel('coding_balanced');
const CODING_ESCALATION_MODEL_ID = getRoutingSlotModel('escalation_coding');
const SEARCH_PREMIUM_MODEL_ID = getRoutingSlotModel('search_premium');
const REASONING_ECONOMY_MODEL_ID = getRoutingSlotModel('reasoning_economy');
const REASONING_BALANCED_MODEL_ID = getRoutingSlotModel('reasoning_balanced');
const IMAGE_MODEL_ID = getRoutingSlotModel('image_generation');
const OPENAI_DEFAULT_MODEL_ID = requireProviderDefaultModel('openai');
const OPENAI_FAST_MODEL_ID = getTaskModelForProvider('openai', 'fast_completion');
const OPENAI_CHAT_MODEL_ID = getTaskModelForProvider('openai', 'chat');
const MINIMAX_MODEL_ID = requireProviderDefaultModel('minimax');

if (!OPENAI_FAST_MODEL_ID || !OPENAI_CHAT_MODEL_ID) {
  throw new Error('Canonical OpenAI fast and chat routes must exist');
}

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
      modelKey: FAST_MODEL_ID,
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
      modelKey: FAST_MODEL_ID,
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
      modelKey: CODING_PREMIUM_MODEL_ID,
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
      modelKey: getRoutingSlotModel('coding_fast'),
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
      budgetRemainingCents: 2.0, // premium route unaffordable; balanced route fits
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: CODING_BALANCED_MODEL_ID,
      effectiveProfile: 'premium',
    });
  });

  it('affordability: keeps falling to a cheaper slot as the budget tightens', () => {
    const result = resolveAutoRoute({
      selection: 'auto',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      budgetRemainingCents: 1.0, // premium and balanced routes are unaffordable; escalation fits
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 1000,
    });

    expect(result).toMatchObject({ status: 'selected', modelKey: CODING_ESCALATION_MODEL_ID });
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

    expect(result).toMatchObject({ status: 'selected', modelKey: FAST_MODEL_ID });
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

    expect(result).toMatchObject({ status: 'selected', modelKey: CODING_PREMIUM_MODEL_ID });
  });

  it('affordability: rejects a long request when only its short-context estimate fits', () => {
    const request = {
      selection: 'auto-premium',
      taskType: 'reasoning',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      usOnly: true,
    } as const;
    const withoutBudget = resolveAutoRoute(request);
    expect(withoutBudget.status).toBe('selected');
    if (withoutBudget.status !== 'selected') return;
    const metadata = getModelMetadataById(withoutBudget.modelKey);
    const [firstTier] = metadata?.inputTokenPricingTiers ?? [];
    expect(firstTier).toBeDefined();
    if (!metadata || !firstTier) return;

    const inputTokens = firstTier.thresholdTokens + 1;
    const outputTokens = 1_000;
    const shortEstimateCents =
      ((inputTokens * metadata.inputCost + outputTokens * metadata.outputCost) / 1_000_000) * 100;
    const tiered = resolveEffectiveModelPricingForInputTokens(
      metadata,
      new Date('2030-01-01T00:00:00Z'),
      inputTokens,
    );
    const longEstimateCents =
      ((inputTokens * tiered.inputCost + outputTokens * tiered.outputCost) / 1_000_000) * 100;
    expect(longEstimateCents).toBeGreaterThan(shortEstimateCents);

    const withMidpointBudget = resolveAutoRoute({
      ...request,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      budgetRemainingCents: (shortEstimateCents + longEstimateCents) / 2,
    });
    if (withMidpointBudget.status === 'selected') {
      expect(withMidpointBudget.modelKey).not.toBe(withoutBudget.modelKey);
    } else {
      expect(withMidpointBudget.code).toBe('no_admitted_route');
    }
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
      modelKey: getRoutingSlotModel('coding_fast'),
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
      modelKey: CODING_PREMIUM_MODEL_ID,
      effectiveProfile: 'premium',
      fallbacks: [
        {
          modelKey: CODING_ESCALATION_MODEL_ID,
          provider: 'zhipu',
          harnessId: 'zhipu/chat-completions',
        },
        {
          modelKey: FAST_MODEL_ID,
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
      modelKey: SEARCH_PREMIUM_MODEL_ID,
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
      modelKey: OPENAI_DEFAULT_MODEL_ID,
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
      modelKey: REASONING_ECONOMY_MODEL_ID,
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
      modelKey: REASONING_BALANCED_MODEL_ID,
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
      modelKey: IMAGE_MODEL_ID,
      harnessId: 'google/media',
    });
  });

  it('falls back from an explicit text model to Auto for a specialist capability when authorized', () => {
    const result = resolveAutoRoute({
      selection: OPENAI_FAST_MODEL_ID,
      taskType: 'image_generation',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'mobile/cloud-chat',
      fallbackToAutoForCapabilityMismatch: true,
    });

    expect(result).toMatchObject({
      status: 'selected',
      requestedSelection: OPENAI_FAST_MODEL_ID,
      modelKey: IMAGE_MODEL_ID,
      harnessId: 'google/media',
      reason: 'capability_fallback',
    });
  });

  it('does not silently replace an explicit model unless capability fallback is authorized', () => {
    const result = resolveAutoRoute({
      selection: OPENAI_FAST_MODEL_ID,
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
      selection: OPENAI_FAST_MODEL_ID,
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: OPENAI_FAST_MODEL_ID,
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
      modelKey: SEARCH_PREMIUM_MODEL_ID,
      harnessId: 'google/generate-content',
      reason: 'preferred_slot',
    });
  });

  it('accepts GA models when the calling runtime supports their harness', () => {
    const result = resolveAutoRoute({
      selection: OPENAI_DEFAULT_MODEL_ID,
      taskType: 'reasoning',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: OPENAI_DEFAULT_MODEL_ID,
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
      modelKey: CODING_PREMIUM_MODEL_ID,
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
      modelKey: CODING_PREMIUM_MODEL_ID,
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
      modelKey: OPENAI_CHAT_MODEL_ID,
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
      modelKey: SEARCH_PREMIUM_MODEL_ID,
      harnessId: 'google/generate-content',
    });
  });

  it('admits AGI Work when the Web runtime executes platform tool discovery', () => {
    const result = resolveAutoRoute({
      selection: MINIMAX_MODEL_ID,
      taskType: 'agentic',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'web/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: MINIMAX_MODEL_ID,
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
      modelKey: SEARCH_PREMIUM_MODEL_ID,
      harnessId: 'google/generate-content',
    });
  });

  it('preserves the current route across a task pivot when it remains a preferred slot', () => {
    const result = resolveAutoRoute({
      selection: 'auto-economy',
      taskType: 'coding',
      previousTaskType: 'simple_chat',
      currentModelKey: FAST_MODEL_ID,
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: FAST_MODEL_ID,
      reason: 'continuity',
    });
  });

  it('reroutes on a task pivot when the current model is not preferred for the new task', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      previousTaskType: 'general',
      currentModelKey: OPENAI_CHAT_MODEL_ID,
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: SEARCH_PREMIUM_MODEL_ID,
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
      modelKey: CODING_PREMIUM_MODEL_ID,
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
    expect(deniedOptional).toMatchObject({ status: 'selected', modelKey: CODING_PREMIUM_MODEL_ID });

    const optionalWithoutDocument = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityRequirements: [{ capabilityId: 'canUseWebSearch', strength: 'optional' }],
    });
    expect(optionalWithoutDocument).toMatchObject({
      status: 'selected',
      modelKey: CODING_PREMIUM_MODEL_ID,
    });
  });
});
