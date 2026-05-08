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

import {
  isOpenAIGpt54MiniModel,
  normalizeOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
  resolveOpenAISupportedReasoningEfforts,
  supportsOpenAIReasoningEffort,
} from '../openai-reasoning-effort';

describe('isOpenAIGpt54MiniModel', () => {
  it('returns true for gpt-5.4-mini', () => {
    expect(isOpenAIGpt54MiniModel({ id: 'gpt-5.4-mini' })).toBe(true);
  });
  it('returns true for date-suffixed gpt-5.4-mini', () => {
    expect(isOpenAIGpt54MiniModel({ id: 'gpt-5.4-mini-2026-04-01' })).toBe(true);
  });
  it('returns false for gpt-5.4', () => {
    expect(isOpenAIGpt54MiniModel({ id: 'gpt-5.4' })).toBe(false);
  });
  it('returns false for gpt-5-mini (different family)', () => {
    expect(isOpenAIGpt54MiniModel({ id: 'gpt-5-mini' })).toBe(false);
  });
  it('returns false for missing id', () => {
    expect(isOpenAIGpt54MiniModel({})).toBe(false);
  });
});

describe('resolveOpenAISupportedReasoningEfforts — golden snapshots', () => {
  it('gpt-5 base supports minimal/low/medium/high', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5' })).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
    ]);
  });

  it('gpt-5.1 supports none/low/medium/high', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.1' })).toEqual([
      'none',
      'low',
      'medium',
      'high',
    ]);
  });

  it('gpt-5.2+ supports none/low/medium/high/xhigh', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.2' })).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.4' })).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('gpt-5-pro supports only high', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5-pro' })).toEqual(['high']);
  });

  it('gpt-5.4-pro supports medium/high/xhigh', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.4-pro' })).toEqual([
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('codex variants drop minimal in favor of low/medium/high/xhigh', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.4-codex' })).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  it('gpt-5.1-codex-mini supports only medium', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'gpt-5.1-codex-mini' })).toEqual([
      'medium',
    ]);
  });

  it('falls back to generic low/medium/high for unknown model', () => {
    expect(resolveOpenAISupportedReasoningEfforts({ id: 'unknown-model-xyz' })).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });

  it('compat.supportedReasoningEfforts overrides family inference', () => {
    expect(
      resolveOpenAISupportedReasoningEfforts({
        id: 'gpt-5',
        compat: { supportedReasoningEfforts: ['low', 'high'] },
      }),
    ).toEqual(['low', 'high']);
  });
});

describe('supportsOpenAIReasoningEffort', () => {
  it('returns true for an effort the model supports', () => {
    expect(supportsOpenAIReasoningEffort({ id: 'gpt-5.1' }, 'low')).toBe(true);
  });
  it('returns false for an unsupported effort', () => {
    expect(supportsOpenAIReasoningEffort({ id: 'gpt-5' }, 'xhigh')).toBe(false);
  });
});

describe('resolveOpenAIReasoningEffortForModel — fallback ladder', () => {
  it('returns the requested effort when supported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5.1' },
        effort: 'medium',
      }),
    ).toBe('medium');
  });

  it('upgrades minimal -> low when the model lacks minimal', () => {
    // gpt-5.1 supports none/low/medium/high but NOT minimal.
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5.1' },
        effort: 'minimal',
      }),
    ).toBe('low');
  });

  it('downgrades xhigh -> high when xhigh is unsupported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5.1' },
        effort: 'xhigh',
      }),
    ).toBe('high');
  });

  it('returns undefined for explicit none/off requests on a model without "none"', () => {
    // gpt-5 supports minimal/low/medium/high (no "none"). Asking for none =>
    // disabled, return undefined so callers strip the field.
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5' },
        effort: 'none',
      }),
    ).toBeUndefined();
  });

  it('respects fallbackMap when the requested effort is not directly supported', () => {
    expect(
      resolveOpenAIReasoningEffortForModel({
        model: { id: 'gpt-5-pro' }, // only supports `high`
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
