import { describe, it, expect } from 'vitest';
import { assessModelSwitchCache } from '../model-switch-cache';

describe('assessModelSwitchCache', () => {
  it('does NOT warn for a brand-new conversation (no prior turns)', () => {
    const a = assessModelSwitchCache({
      priorModelId: 'claude-opus-5',
      nextModelId: 'gpt-5',
      priorTurnCount: 0,
    });
    expect(a.warn).toBe(false);
    expect(a.resetsCache).toBe(false);
    expect(a.reason).toBe('no-prior-turns');
    expect(a.message).toBe('');
  });

  it('does NOT warn when there is no known prior model', () => {
    const a = assessModelSwitchCache({
      priorModelId: null,
      nextModelId: 'gpt-5',
      priorTurnCount: 3,
    });
    expect(a.warn).toBe(false);
    expect(a.reason).toBe('no-prior-model');
  });

  it('does NOT warn when re-selecting the same model', () => {
    const a = assessModelSwitchCache({
      priorModelId: 'claude-opus-5',
      nextModelId: 'claude-opus-5',
      priorTurnCount: 5,
    });
    expect(a.warn).toBe(false);
    expect(a.reason).toBe('same-model');
  });

  it('WARNS when switching to a different model with prior turns (cache reset)', () => {
    const a = assessModelSwitchCache({
      priorModelId: 'claude-opus-5',
      nextModelId: 'gpt-5',
      priorTurnCount: 2,
    });
    expect(a.resetsCache).toBe(true);
    expect(a.warn).toBe(true);
    expect(a.reason).toBe('cache-reset');
    expect(a.message).toMatch(/new prompt cache/i);
    expect(a.message).toMatch(/full input price/i);
  });

  it('uses human labels in the message when provided', () => {
    const a = assessModelSwitchCache({
      priorModelId: 'claude-opus-5',
      nextModelId: 'gpt-5',
      priorTurnCount: 1,
      priorModelLabel: 'Opus 5',
      nextModelLabel: 'GPT-5',
    });
    expect(a.message).toContain('Opus 5');
    expect(a.message).toContain('GPT-5');
    expect(a.message).not.toContain('claude-opus-5');
  });

  it('treats same-provider different-model as a reset too (per-model cache key)', () => {
    const a = assessModelSwitchCache({
      priorModelId: 'claude-opus-5',
      nextModelId: 'claude-sonnet-5',
      priorTurnCount: 4,
    });
    expect(a.warn).toBe(true);
    expect(a.reason).toBe('cache-reset');
  });
});
