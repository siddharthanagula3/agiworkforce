/**
 * Golden tests for OpenAI reasoning-effort resolution.
 *
 * Pins the per-family supported-effort lists (GPT-5.x, Codex variants,
 * Pro variants) and the fallback ladder when an unsupported effort is
 * requested. Refactors that touch openai-reasoning-effort.ts MUST keep
 * these mappings stable — adapters depend on them to gate
 * `reasoning: { effort: ... }` payloads.
 */

import { describe, expect, it } from 'vitest';

import { getModelReasoning } from '@agiworkforce/types';

import {
  normalizeOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
  resolveOpenAISupportedReasoningEfforts,
  supportsOpenAIReasoningEffort,
} from '../openai-reasoning-effort';

describe('resolveOpenAISupportedReasoningEfforts — golden snapshots', () => {
  it('reads the complete current effort ladder from the canonical model registry', () => {
    const catalogReasoning = getModelReasoning('gpt-5.6-sol');

    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.6-sol' })).toEqual(
      catalogReasoning.supportedEfforts,
    );
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.6-sol' })).toContain('max');
  });

  it('does not infer reasoning for a catalog non-reasoning model', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-4.1-nano' })).toEqual([]);
  });

  it('uses the registry effort set for the current OpenAI flagship', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.5' })).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('uses the endpoint-level fallback for an unregistered OpenAI Codex model', () => {
    expect(
      resolveOpenAISupportedReasoningEfforts({
        provider: 'openai-codex',
        id: 'unregistered-codex-model',
      }),
    ).toEqual(['low', 'medium', 'high', 'xhigh']);
  });

  it('falls back to generic low/medium/high for unknown model', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'unknown-model-xyz' })).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });

  it('compat.supportedReasoningEfforts overrides the canonical registry', () => {
    expect(
      resolveOpenAISupportedReasoningEfforts({
        id: 'gpt-5.5',
        compat: { supportedReasoningEfforts: ['low', 'high'] },
      }),
    ).toEqual(['low', 'high']);
  });
});

describe('supportsOpenAIReasoningEffort', () => {
  it('returns true for an effort the model supports', () => {
    expect(supportsOpenAIReasoningEffort({ id: 'gpt-5.5' }, 'low')).toBe(true);
  });
  it('returns false for an unsupported effort', () => {
    expect(supportsOpenAIReasoningEffort({ id: 'gpt-5.5' }, 'max')).toBe(false);
  });
});

describe('resolveOpenAIReasoningEffortForModel — fallback ladder', () => {
  it('returns the requested effort when supported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5.5' },
        effort: 'medium',
      }),
    ).toBe('medium');
  });

  it('upgrades minimal -> low when the model lacks minimal', () => {
    // gpt-5.5 supports none/low/medium/high/xhigh but NOT minimal.
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5.5' },
        effort: 'minimal',
      }),
    ).toBe('low');
  });

  it('downgrades xhigh -> high when xhigh is unsupported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'custom-model', compat: { supportedReasoningEfforts: ['high'] } },
        effort: 'xhigh',
      }),
    ).toBe('high');
  });

  it('returns undefined for explicit none/off requests on a model without "none"', () => {
    // This explicit compatibility profile has no "none". Asking for none =>
    // disabled, return undefined so callers strip the field.
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'custom-model', compat: { supportedReasoningEfforts: ['low', 'high'] } },
        effort: 'none',
      }),
    ).toBeUndefined();
  });

  it('respects fallbackMap when the requested effort is not directly supported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'custom-model', compat: { supportedReasoningEfforts: ['medium', 'high'] } },
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
