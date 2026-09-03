import { describe, expect, it } from 'vitest';
import { redactSecretsFromValue, scanValueForSecrets } from '../secrets-audit';

const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;

describe('scanValueForSecrets', () => {
  it('finds a secret nested inside an array of objects', () => {
    const detections = scanValueForSecrets([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: `use ${STRIPE_KEY} for billing` },
    ]);
    expect(detections.some((detection) => detection.name === 'Stripe Live Key')).toBe(true);
  });

  it('returns no detections for clean content', () => {
    expect(scanValueForSecrets({ a: ['x', 'y'], b: 'plain text' })).toEqual([]);
  });

  it('finds a match at any position among many string leaves', () => {
    const messages = Array.from({ length: 50 }, (_, index) => ({ content: `line ${index}` }));
    messages[37] = { content: `token ${STRIPE_KEY}` };
    expect(scanValueForSecrets({ messages }).length).toBeGreaterThan(0);
  });
});

describe('redactSecretsFromValue', () => {
  it('redacts a matched string leaf and preserves the surrounding structure', () => {
    const { value, detections } = redactSecretsFromValue({
      title: 'note',
      messages: [{ role: 'user', display_args: `key is ${STRIPE_KEY}` }],
    });

    expect(detections.length).toBeGreaterThan(0);
    expect((value as { title: string }).title).toBe('note');
    const message = (value as { messages: Array<{ display_args: string }> }).messages[0]!;
    expect(message.display_args).not.toContain(STRIPE_KEY);
    expect(message.display_args).toContain('[REDACTED]');
  });

  it('leaves clean content untouched and reports no detections', () => {
    const input = { a: 'hello', b: ['world'] };
    const { value, detections } = redactSecretsFromValue(input);
    expect(detections).toEqual([]);
    expect(value).toEqual(input);
  });

  it('redacts only the matching leaf, leaving unrelated leaves intact', () => {
    const { value } = redactSecretsFromValue({ a: STRIPE_KEY, b: 'clean', c: ['also clean'] });
    const result = value as { a: string; b: string; c: string[] };
    expect(result.a).not.toBe(STRIPE_KEY);
    expect(result.b).toBe('clean');
    expect(result.c).toEqual(['also clean']);
  });
});
