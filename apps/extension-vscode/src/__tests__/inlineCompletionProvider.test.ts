/**
 * inlineCompletionProvider.test.ts — Tests for inline completion logic
 *
 * Tests the extractCompletionText function and provider behavior patterns.
 */

import { describe, it, expect, vi } from 'vitest';
import { AgiWorkforcePaywallError } from '../utils/api';

// Replicate the extractCompletionText function for testing
function extractCompletionText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }

  const fenced = /```(?:\w+)?\s*\n([\s\S]*?)```/.exec(trimmed);
  const fromFence = fenced?.[1]?.trimEnd();
  if (fromFence !== undefined && fromFence !== '') {
    return fromFence;
  }

  const firstLine = trimmed.split('\n').find((line) => line.trim() !== '');
  return firstLine?.trim() ?? '';
}

describe('extractCompletionText', () => {
  it('returns empty string for empty input', () => {
    expect(extractCompletionText('')).toBe('');
    expect(extractCompletionText('   ')).toBe('');
  });

  it('extracts code from fenced block', () => {
    const raw = '```typescript\nconst x = 42;\n```';
    expect(extractCompletionText(raw)).toBe('const x = 42;');
  });

  it('extracts code from fenced block without language', () => {
    const raw = '```\nconst x = 42;\n```';
    expect(extractCompletionText(raw)).toBe('const x = 42;');
  });

  it('falls back to first meaningful line when no code block', () => {
    const raw = 'return a + b;';
    expect(extractCompletionText(raw)).toBe('return a + b;');
  });

  it('skips empty lines when falling back', () => {
    const raw = '\n\n  return a + b;\nmore code';
    expect(extractCompletionText(raw)).toBe('return a + b;');
  });

  it('handles multiline code in fenced blocks', () => {
    const raw = '```js\nconst a = 1;\nconst b = 2;\n```';
    const result = extractCompletionText(raw);
    expect(result).toContain('const a = 1;');
    expect(result).toContain('const b = 2;');
  });

  it('trims trailing whitespace from fenced block content', () => {
    const raw = '```\ncode   \n   \n```';
    const result = extractCompletionText(raw);
    expect(result).not.toMatch(/\s+$/);
  });
});

describe('inline completion filtering logic', () => {
  const MIN_PREFIX_CHARS = 3;

  it('requires minimum prefix characters', () => {
    const shouldSkip = (prefix: string) => prefix.trim().length < MIN_PREFIX_CHARS;

    expect(shouldSkip('')).toBe(true);
    expect(shouldSkip('ab')).toBe(true);
    expect(shouldSkip('abc')).toBe(false);
    expect(shouldSkip('const x')).toBe(false);
  });

  it('skips when cursor is in the middle of non-whitespace text', () => {
    const shouldSkip = (suffix: string) => suffix.trim() !== '';

    expect(shouldSkip(')')).toBe(true);
    expect(shouldSkip(' more code')).toBe(true);
    expect(shouldSkip('')).toBe(false);
    expect(shouldSkip('   ')).toBe(false);
  });
});

describe('inline completion cache logic', () => {
  const CACHE_TTL_MS = 15_000;

  it('considers cache valid within TTL', () => {
    const createdAt = Date.now() - 5_000; // 5 seconds ago
    const isValid = Date.now() - createdAt <= CACHE_TTL_MS;
    expect(isValid).toBe(true);
  });

  it('considers cache stale after TTL', () => {
    const createdAt = Date.now() - 20_000; // 20 seconds ago
    const isValid = Date.now() - createdAt <= CACHE_TTL_MS;
    expect(isValid).toBe(false);
  });

  it('builds a deterministic cache key from context', () => {
    const uri = 'file:///src/app.ts';
    const line = 10;
    const char = 15;
    const context = 'const x = 1;\nconst y = ';

    const key = `${uri}::${line}:${char}::${context.slice(-1200)}`;
    const key2 = `${uri}::${line}:${char}::${context.slice(-1200)}`;
    expect(key).toBe(key2);
  });
});

// ── Paywall suppression logic ────────────────────────────────────────────────
// Test the paywall-suppression flag logic used in AgiInlineCompletionProvider.
// We replicate the flag state machine in isolation because the full provider
// requires a VS Code extension host.

describe('inline completion paywall suppression', () => {
  it('AgiWorkforcePaywallError is an Error subclass', () => {
    const err = new AgiWorkforcePaywallError('chat', 'hobby', 'reason');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgiWorkforcePaywallError);
  });

  it('paywall flag prevents further completion attempts', () => {
    // Simulate the flag state machine from AgiInlineCompletionProvider
    let paywallSuppressed = false;

    function shouldAttemptCompletion(): boolean {
      return !paywallSuppressed;
    }

    function handleError(error: unknown): void {
      if (error instanceof AgiWorkforcePaywallError && !paywallSuppressed) {
        paywallSuppressed = true;
      }
    }

    expect(shouldAttemptCompletion()).toBe(true);

    // First paywall hit
    handleError(new AgiWorkforcePaywallError('chat', 'hobby', 'Token cap exceeded'));
    expect(paywallSuppressed).toBe(true);
    expect(shouldAttemptCompletion()).toBe(false);

    // Subsequent paywall hits don't change state (idempotent)
    handleError(new AgiWorkforcePaywallError('chat', 'hobby', 'Token cap exceeded'));
    expect(paywallSuppressed).toBe(true);
    expect(shouldAttemptCompletion()).toBe(false);
  });

  it('non-paywall errors do not set the suppression flag', () => {
    let paywallSuppressed = false;

    function handleError(error: unknown): void {
      if (error instanceof AgiWorkforcePaywallError && !paywallSuppressed) {
        paywallSuppressed = true;
      }
    }

    // Generic error — should NOT set flag
    handleError(new Error('Network error'));
    expect(paywallSuppressed).toBe(false);
  });

  it('returns empty completions on paywall (simulated)', async () => {
    // Simulate the catch block returning [] on paywall
    async function simulateProvide(shouldThrowPaywall: boolean): Promise<unknown[]> {
      try {
        if (shouldThrowPaywall) {
          throw new AgiWorkforcePaywallError('chat', 'hobby', 'Cap exceeded');
        }
        return [{ insertText: 'const x = 1;' }];
      } catch (error) {
        if (error instanceof AgiWorkforcePaywallError) {
          return [];
        }
        return [];
      }
    }

    const onPaywall = await simulateProvide(true);
    expect(onPaywall).toEqual([]);

    const onSuccess = await simulateProvide(false);
    expect(onSuccess).toHaveLength(1);
  });

  it('does not throw on paywall — returns empty array', async () => {
    async function simulateProvide(): Promise<unknown[]> {
      try {
        throw new AgiWorkforcePaywallError('chat', 'hobby', 'Cap exceeded');
      } catch (error) {
        if (error instanceof AgiWorkforcePaywallError) {
          return [];
        }
        throw error; // re-throw unexpected errors
      }
    }

    await expect(simulateProvide()).resolves.toEqual([]);
  });
});
