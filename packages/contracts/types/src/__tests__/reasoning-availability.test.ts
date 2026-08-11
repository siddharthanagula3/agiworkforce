import { describe, it, expect } from 'vitest';
import {
  getModelReasoning,
  getModelMetadataById,
  getDisplayModels,
  getSelectableModels,
  isModelSelectable,
  modelsCatalog,
  SLOT_REGISTRY,
} from '../model-catalog';

function requireCatalogValue(value: string | null | undefined, description: string): string {
  if (!value) throw new Error(`Canonical catalog is missing ${description}`);
  return value;
}

const googleFastModelId = requireCatalogValue(
  modelsCatalog.providers['google']?.taskRouting?.fast_completion,
  'the Google fast-completion route',
);
const googleReasoningModelId = requireCatalogValue(
  modelsCatalog.providers['google']?.taskRouting?.complex_reasoning,
  'the Google complex-reasoning route',
);
const openAiChatModelId = requireCatalogValue(
  modelsCatalog.providers['openai']?.taskRouting?.chat,
  'the OpenAI chat route',
);
const openAiReasoningModelId = requireCatalogValue(
  modelsCatalog.providers['openai']?.taskRouting?.complex_reasoning,
  'the OpenAI complex-reasoning route',
);
const xaiDefaultModelId = requireCatalogValue(
  modelsCatalog.providers['xai']?.defaultModel,
  'the xAI default route',
);
const anthropicMaxEffortModelId = requireCatalogValue(
  Object.values(modelsCatalog.models).find(
    (model) =>
      model.provider === 'anthropic' &&
      model.reasoning?.supportedEfforts?.includes('max') &&
      model.reasoning.thinkingDefault === 'adaptive',
  )?.id,
  'an Anthropic model with max reasoning effort',
);
const nonReasoningSearchModelId = requireCatalogValue(
  Object.values(modelsCatalog.models).find(
    (model) => model.provider === 'perplexity' && !model.reasoning?.capable,
  )?.id,
  'a non-reasoning search model',
);

/**
 * Reasoning-effort-capability wave (2026-07-10). Covers:
 *  - the additive per-model `reasoning` blocks (control + supportedEfforts),
 *  - the `availability` axis + getDisplayModels/getSelectableModels split,
 *  - the live/selectable split and non-live non-routability invariant.
 */
describe('per-model reasoning capability', () => {
  it('exposes the fast Google route effort set and minimal default', () => {
    const r = getModelReasoning(googleFastModelId);
    expect(r.capable).toBe(true);
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(r.defaultEffort).toBe('minimal');
    expect(r.canDisableThinking).toBe(false);
  });

  it('exposes only the provider-supported Google reasoning-route effort levels', () => {
    const r = getModelReasoning(googleReasoningModelId);
    expect(r.supportedEfforts).toEqual(['low', 'medium', 'high']);
    expect(r.supportedEfforts).not.toContain('minimal');
  });

  it('hides effort for a non-reasoning model', () => {
    const r = getModelReasoning(nonReasoningSearchModelId);
    expect(r.capable).toBe(false);
    expect(r.control).toBe('none');
  });

  it('exposes the OpenAI chat-route effort set without minimal', () => {
    const r = getModelReasoning(openAiChatModelId);
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(r.supportedEfforts).not.toContain('minimal');
  });

  it('exposes the Anthropic max-effort model through adaptive reasoning', () => {
    const r = getModelReasoning(anthropicMaxEffortModelId);
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(r.request?.api).toBe('messages');
    expect(r.request?.effortPath).toBe('output_config.effort');
    expect(r.thinkingDefault).toBe('adaptive');
    expect(r.supportsManualThinking).toBe(false);
    expect(r.maxEffortWhenThinkingDisabled).toBe('high');
    expect(r.rejectsSamplingParameters).toBe(true);
  });

  it('resolves Anthropic max-effort reasoning through its canonical provider ID', () => {
    expect(getModelMetadataById(anthropicMaxEffortModelId)?.reasoning?.control).toBe(
      'effort_levels',
    );
  });

  it('has no model left using the classic thinking_budget control', () => {
    // Haiku 4.5 was the only one, and it was retired 2026-07-27. Asserting the
    // absence rather than deleting the test: `thinking_budget` is still a
    // supported control in code, so this records that nothing exercises it and
    // fails — prompting a real test — as soon as a model adopts it again.
    const withBudgetControl = Object.values(modelsCatalog.models)
      .map((m) => m.id)
      .filter((id) => getModelReasoning(id).control === 'thinking_budget');
    expect(withBudgetControl).toEqual([]);
  });

  it('marks the xAI default route as an always-on reasoner', () => {
    const r = getModelReasoning(xaiDefaultModelId);
    expect(r.control).toBe('always_on');
    expect(r.canDisableThinking).toBe(false);
  });
});

describe('availability axis + display/selectable split', () => {
  it('lists every routed OpenAI chat model in both display and selectable sets', () => {
    const displayIds = new Set(getDisplayModels().map((m) => m.id));
    const selectableIds = new Set(getSelectableModels().map((m) => m.id));
    const routedOpenAiIds = new Set(
      [
        modelsCatalog.providers['openai']?.defaultModel,
        ...Object.values(modelsCatalog.providers['openai']?.taskRouting ?? {}),
      ].filter((id): id is string => Boolean(id)),
    );
    expect(routedOpenAiIds.size).toBeGreaterThan(0);
    for (const id of routedOpenAiIds) {
      expect(displayIds.has(id)).toBe(true);
      expect(selectableIds.has(id)).toBe(true);
      expect(isModelSelectable(id)).toBe(true);
      expect(getModelMetadataById(id)?.availability ?? 'live').toBe('live');
    }
  });

  it('keeps every non-live model out of every routable/tier set (availability invariant)', () => {
    const nonLive = new Set(
      Object.entries(modelsCatalog.models)
        .filter(([, m]) => (m.availability ?? 'live') !== 'live')
        .map(([id]) => id),
    );
    const routable = new Set<string>();
    for (const bucket of Object.values(modelsCatalog.tierAllowedModels)) {
      for (const id of bucket) routable.add(id);
    }
    for (const cfg of Object.values(modelsCatalog.providers)) {
      for (const id of Object.values(cfg.taskRouting ?? {})) if (id) routable.add(id as string);
      if (cfg.defaultModel) routable.add(cfg.defaultModel);
    }
    for (const slot of Object.values(SLOT_REGISTRY)) routable.add(slot.modelId);

    for (const id of nonLive) {
      expect(routable.has(id)).toBe(false);
    }
  });

  it('encodes Responses-only reasoning surfaces without making them chat parameters', () => {
    const r = getModelReasoning(openAiReasoningModelId);
    expect(r.supportedEfforts).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(typeof r.ultraMode).toBe('object');
    if (typeof r.ultraMode === 'object') {
      expect(r.ultraMode.endpoint).toBe('responses');
      expect(r.ultraMode.param).toBe('multi_agent.enabled');
    }
    expect(r.proMode?.endpoint).toBe('responses');
    expect(r.persistentReasoning?.endpoint).toBe('responses');
  });
});
