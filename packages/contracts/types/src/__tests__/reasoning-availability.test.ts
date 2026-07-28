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

/**
 * Reasoning-effort-capability wave (2026-07-10). Covers:
 *  - the additive per-model `reasoning` blocks (control + supportedEfforts),
 *  - the `availability` axis + getDisplayModels/getSelectableModels split,
 *  - the live/selectable split and non-live non-routability invariant.
 */
describe('per-model reasoning capability', () => {
  it('exposes the current Flash-Lite effort set and minimal default', () => {
    const r = getModelReasoning('gemini-3.5-flash-lite');
    expect(r.capable).toBe(true);
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(r.defaultEffort).toBe('minimal');
    expect(r.canDisableThinking).toBe(false);
  });

  it('exposes only the provider-supported Gemini 3.1 Pro effort levels', () => {
    const r = getModelReasoning('gemini-3.1-pro-preview');
    expect(r.supportedEfforts).toEqual(['low', 'medium', 'high']);
    expect(r.supportedEfforts).not.toContain('minimal');
  });

  it('hides effort for a non-reasoning model', () => {
    const r = getModelReasoning('sonar');
    expect(r.capable).toBe(false);
    expect(r.control).toBe('none');
  });

  it('exposes the OpenAI GPT-5.6 Terra effort set (none/low/medium/high/xhigh/max; no minimal)', () => {
    const r = getModelReasoning('gpt-5.6-terra');
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(r.supportedEfforts).not.toContain('minimal');
  });

  it('exposes the Anthropic Opus 5 effort set (adds max) via adaptive+output_config.effort', () => {
    const r = getModelReasoning('claude-opus-5');
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(r.request?.api).toBe('messages');
    expect(r.request?.effortPath).toBe('output_config.effort');
    expect(r.thinkingDefault).toBe('adaptive');
    expect(r.supportsManualThinking).toBe(false);
    expect(r.maxEffortWhenThinkingDisabled).toBe('high');
    expect(r.rejectsSamplingParameters).toBe(true);
  });

  it('resolves Opus reasoning through its canonical provider ID', () => {
    expect(getModelMetadataById('claude-opus-5')?.reasoning?.control).toBe('effort_levels');
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

  it('marks grok-4.5 as an always-on reasoner that cannot disable thinking', () => {
    const r = getModelReasoning('grok-4.5');
    expect(r.control).toBe('always_on');
    expect(r.canDisableThinking).toBe(false);
  });
});

describe('availability axis + display/selectable split', () => {
  it('lists the GA GPT-5.6 family in both the display and selectable sets', () => {
    const displayIds = new Set(getDisplayModels().map((m) => m.id));
    const selectableIds = new Set(getSelectableModels().map((m) => m.id));
    for (const id of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
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

  it('encodes the inert 5.6 Responses-only surfaces without wiring them (ultra/pro/persistent)', () => {
    const r = getModelReasoning('gpt-5.6-sol');
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
