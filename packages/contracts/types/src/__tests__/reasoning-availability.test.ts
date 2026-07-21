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
  it('hides effort for non-reasoning models (gemini-3.1-flash-lite ⇒ none)', () => {
    // Was gpt-4.1-nano; removed from the catalog 2026-07-11 (founder directive).
    // gemini-3.1-flash-lite is a real, current non-reasoning model in its place.
    const r = getModelReasoning('gemini-3.1-flash-lite');
    expect(r.capable).toBe(false);
    expect(r.control).toBe('none');
  });

  it('exposes the OpenAI GPT-5.6 Terra effort set (none/low/medium/high/xhigh/max; no minimal)', () => {
    const r = getModelReasoning('gpt-5.6-terra');
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(r.supportedEfforts).not.toContain('minimal');
  });

  it('exposes the Anthropic Opus 4.8 effort set (adds max) via adaptive+output_config.effort', () => {
    const r = getModelReasoning('claude-opus-4.8');
    expect(r.control).toBe('effort_levels');
    expect(r.supportedEfforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(r.request?.api).toBe('messages');
    expect(r.request?.effortPath).toBe('output_config.effort');
  });

  it('resolves Opus reasoning via the apiModelId too (route may pass either id)', () => {
    expect(getModelMetadataById('claude-opus-4-8')?.reasoning?.control).toBe('effort_levels');
  });

  it('marks Haiku 4.5 as thinking-capable with classic thinking_budget control', () => {
    const meta = getModelMetadataById('claude-haiku-4.5');
    expect(meta?.capabilities.thinking).toBe(true); // was WRONG (false) before this wave
    const r = getModelReasoning('claude-haiku-4.5');
    expect(r.control).toBe('thinking_budget');
    expect(r.thinkingBudget?.max).toBe(32768);
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
