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
      modelKey: 'glm-5.2',
      requestedProfile: 'economy',
      effectiveProfile: 'economy',
      reason: 'preferred_slot',
    });
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
      modelKey: 'gemini-3.1-flash-lite',
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
      modelKey: 'claude-opus-4.8',
      effectiveProfile: 'premium',
      fallbacks: [
        {
          modelKey: 'glm-5.2',
          provider: 'zhipu',
          harnessId: 'zhipu/chat-completions',
        },
        {
          modelKey: 'gemini-3.1-flash-lite',
          provider: 'google',
          harnessId: 'google/generate-content',
        },
      ],
    });
  });

  it('emits only cross-provider fallbacks in registry policy order', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'sonar-deep-research',
      fallbacks: [
        {
          modelKey: 'gemini-3.1-flash-lite',
          provider: 'google',
          harnessId: 'google/generate-content',
        },
      ],
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

  it('admits basic exactly like pro (budget-differentiated tier, not a free downgrade)', () => {
    const args = {
      selection: 'auto-balanced',
      taskType: 'reasoning',
      trustMode: 'managed_cloud',
    } as const;
    const asBasic = resolveAutoRoute({ ...args, subscriptionTier: 'basic' });
    const asPro = resolveAutoRoute({ ...args, subscriptionTier: 'pro' });
    const asFree = resolveAutoRoute({ ...args, subscriptionTier: 'free' });

    expect(asBasic).toEqual(asPro);
    expect(asBasic).not.toEqual(asFree);
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

  it('selects the catalog research route when its web-search harness is implemented', () => {
    const result = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'research',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'sonar-deep-research',
      harnessId: 'perplexity/chat-completions',
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
      modelKey: 'claude-opus-4.8',
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
      modelKey: 'claude-opus-4.8',
      harnessId: 'anthropic/messages',
    });
  });

  it('fails closed when a surface runtime profile is not implemented', () => {
    const result = resolveAutoRoute({
      selection: 'auto-balanced',
      taskType: 'general',
      subscriptionTier: 'pro',
      trustMode: 'managed_cloud',
      runtimeProfileId: 'desktop/cloud-chat',
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'runtime_profile_unavailable',
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
      modelKey: 'sonar-deep-research',
      harnessId: 'perplexity/chat-completions',
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
      modelKey: 'sonar-deep-research',
      harnessId: 'perplexity/chat-completions',
    });
  });

  it('preserves the current route across a task pivot when it remains a preferred slot', () => {
    const result = resolveAutoRoute({
      selection: 'auto-economy',
      taskType: 'coding',
      previousTaskType: 'simple_chat',
      currentModelKey: 'gemini-3.1-flash-lite',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
    });

    expect(result).toMatchObject({
      status: 'selected',
      modelKey: 'gemini-3.1-flash-lite',
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
      modelKey: 'sonar-deep-research',
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
      modelKey: 'claude-opus-4.8',
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
    expect(deniedOptional).toMatchObject({ status: 'selected', modelKey: 'claude-opus-4.8' });

    const optionalWithoutDocument = resolveAutoRoute({
      selection: 'auto-premium',
      taskType: 'coding',
      subscriptionTier: 'max',
      trustMode: 'managed_cloud',
      capabilityRequirements: [{ capabilityId: 'canUseWebSearch', strength: 'optional' }],
    });
    expect(optionalWithoutDocument).toMatchObject({
      status: 'selected',
      modelKey: 'claude-opus-4.8',
    });
  });
});
