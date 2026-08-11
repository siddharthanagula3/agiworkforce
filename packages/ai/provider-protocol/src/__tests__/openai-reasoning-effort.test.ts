/**
 * Golden tests for OpenAI reasoning-effort resolution.
 *
 * Pins catalog and endpoint compatibility effort lists and the fallback ladder
 * when an unsupported effort is
 * requested. Refactors that touch openai-reasoning-effort.ts MUST keep
 * these mappings stable — adapters depend on them to gate
 * `reasoning: { effort: ... }` payloads.
 */

import { describe, expect, it } from 'vitest';

import {
  getModelReasoning,
  getModelsForProvider,
  getTaskModelForProvider,
} from '@agiworkforce/types';

import {
  normalizeOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
  resolveOpenAISupportedReasoningEfforts,
  supportsOpenAIReasoningEffort,
} from '../openai-reasoning-effort';

const openAIReasoningModelId = getTaskModelForProvider('openai', 'complex_reasoning');
const openAIChatModelId = getTaskModelForProvider('openai', 'chat');
const openAINonReasoningModelId = getModelsForProvider('openai').find(
  (model) => !getModelReasoning(model.id).capable,
)?.id;

if (!openAIReasoningModelId || !openAIChatModelId || !openAINonReasoningModelId) {
  throw new Error('Canonical OpenAI reasoning, chat, and non-reasoning fixtures must exist');
}

describe('resolveOpenAISupportedReasoningEfforts — golden snapshots', () => {
  it('reads the complete current effort ladder from the canonical model registry', () => {
    const catalogReasoning = getModelReasoning(openAIReasoningModelId);

    expect(resolveOpenAISupportedReasoningEfforts({ id: openAIReasoningModelId })).toEqual(
      catalogReasoning.supportedEfforts,
    );
    expect(resolveOpenAISupportedReasoningEfforts({ id: openAIReasoningModelId })).toContain('max');
  });

  it('does not infer reasoning for a catalog non-reasoning model', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: openAINonReasoningModelId })).toEqual([]);
  });

  it('uses the registry effort set for the current OpenAI chat model', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: openAIChatModelId })).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('uses the endpoint-level fallback for an unregistered OpenAI Codex model', () => {
    expect(
      resolveOpenAISupportedReasoningEfforts({
        provider: 'openai-codex',
        id: 'fixture-unregistered-codex-model',
      }),
    ).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('falls back to generic low/medium/high for unknown model', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'fixture-unknown-model' })).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });

  it('compat.supportedReasoningEfforts overrides the canonical registry', () => {
    expect(
      resolveOpenAISupportedReasoningEfforts({
        id: openAIReasoningModelId,
        compat: { supportedReasoningEfforts: ['low', 'high'] },
      }),
    ).toEqual(['low', 'high']);
  });
});

describe('supportsOpenAIReasoningEffort', () => {
  it('returns true for an effort the model supports', () => {
    expect(supportsOpenAIReasoningEffort({ id: openAIReasoningModelId }, 'low')).toBe(true);
  });
  it('returns false for an unsupported effort', () => {
    expect(supportsOpenAIReasoningEffort({ id: openAIReasoningModelId }, 'minimal')).toBe(false);
  });
});

describe('resolveOpenAIReasoningEffortForModel — fallback ladder', () => {
  it('returns the requested effort when supported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: openAIReasoningModelId },
        effort: 'medium',
      }),
    ).toBe('medium');
  });

  it('upgrades minimal -> low when the model lacks minimal', () => {
    // The current routed reasoning model supports the full ladder except minimal.
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: openAIReasoningModelId },
        effort: 'minimal',
      }),
    ).toBe('low');
  });

  it('downgrades xhigh -> high when xhigh is unsupported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'fixture-custom-model', compat: { supportedReasoningEfforts: ['high'] } },
        effort: 'xhigh',
      }),
    ).toBe('high');
  });

  it('returns undefined for explicit none/off requests on a model without "none"', () => {
    // This explicit compatibility profile has no "none". Asking for none =>
    // disabled, return undefined so callers strip the field.
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: {
          id: 'fixture-custom-model',
          compat: { supportedReasoningEfforts: ['low', 'high'] },
        },
        effort: 'none',
      }),
    ).toBeUndefined();
  });

  it('respects fallbackMap when the requested effort is not directly supported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: {
          id: 'fixture-custom-model',
          compat: { supportedReasoningEfforts: ['medium', 'high'] },
        },
        effort: 'medium',
        fallbackMap: { medium: 'high' },
      }),
    ).toBe('high');
  });
});

describe('normalizeOpenAIReasoningEffort', () => {
  it('returns the same string (identity for current shape)', () => {
    expect(normalizeOpenAIReasoningEffort('minimal')).toBe('minimal');
    expect(normalizeOpenAIReasoningEffort('high')).toBe('high');
  });
});
