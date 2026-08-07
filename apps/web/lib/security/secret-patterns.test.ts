import { describe, expect, it } from 'vitest';

import { ASSERTABLE_SECRET_PATTERNS, SECRET_PATTERN_REGISTRY, globalize } from './secret-patterns';
import { assertNoLeaks, LeakDetectedError, SECRET_PATTERNS } from '../leak-detector';
import { containsSecrets, redactSecrets, scanForSecrets } from './secrets-audit';

// Synthetic, structurally-valid but non-functional credentials.
const FAKE_ANTHROPIC_KEY = `sk-${'a1B2c3D4e5F6g7H8'.repeat(3)}`;
const FAKE_STRIPE_LIVE = `sk_live_${'0'.repeat(30)}`;
const FAKE_JWT = `eyJ${'a'.repeat(24)}.${'b'.repeat(24)}`;
const FAKE_GITHUB_TOKEN = `ghp_${'a'.repeat(36)}`;
const FAKE_AWS_ACCESS_KEY = `AKIA${'A'.repeat(16)}`;

describe('secret pattern registry', () => {
  it('is the single source both modules read', () => {
    // Regression: leak-detector and secrets-audit each owned a divergent list
    // (6 vs 19 patterns), so a pattern added to one silently missed the other.
    expect(SECRET_PATTERNS).toBe(ASSERTABLE_SECRET_PATTERNS);
    expect(SECRET_PATTERN_REGISTRY.length).toBeGreaterThan(ASSERTABLE_SECRET_PATTERNS.length);
  });

  it('stores patterns without the global flag so lastIndex cannot leak between callers', () => {
    for (const entry of SECRET_PATTERN_REGISTRY) {
      expect(entry.pattern.flags).not.toContain('g');
    }
    expect(globalize(/abc/i).flags).toContain('g');
    expect(globalize(/abc/i).flags).toContain('i');
    // Already-global patterns are returned with their flags intact.
    expect(globalize(/abc/g).flags).toBe('g');
  });
});

describe('assertNoLeaks (throwing guard)', () => {
  it.each([
    ['Anthropic/OpenAI key', FAKE_ANTHROPIC_KEY],
    ['Stripe live key', FAKE_STRIPE_LIVE],
    ['JWT', FAKE_JWT],
    ['bearer token', `Bearer ${'a'.repeat(24)}`],
  ])('throws on a %s', (_label, value) => {
    expect(() => assertNoLeaks('test', { field: value })).toThrow(LeakDetectedError);
  });

  it('walks nested objects and arrays', () => {
    expect(() => assertNoLeaks('test', { a: [{ b: FAKE_ANTHROPIC_KEY }] })).toThrow(
      LeakDetectedError,
    );
  });

  // The guard aborts a live request, so it must stay narrow. A support
  // escalation that merely contains the word "password" must not be rejected.
  it.each([
    ['ordinary prose mentioning a password', 'I forgot my password and cannot sign in'],
    ['a secret-shaped but scan-only match', 'api_key=abcdefghijklmnopqrstuvwxyz'],
    ['a credit-card-shaped number', 'my card is 4111111111111111'],
  ])('does not throw on %s', (_label, value) => {
    expect(() => assertNoLeaks('test', { field: value })).not.toThrow();
  });
});

describe('scanning API (non-throwing)', () => {
  it('detects credentials the throwing guard deliberately ignores', () => {
    expect(containsSecrets(FAKE_GITHUB_TOKEN)).toBe(true);
    expect(containsSecrets(FAKE_AWS_ACCESS_KEY)).toBe(true);
    expect(() => assertNoLeaks('test', FAKE_GITHUB_TOKEN)).not.toThrow();
  });

  it('reports a masked preview rather than the matched secret', () => {
    const detections = scanForSecrets(`token: ${FAKE_GITHUB_TOKEN}`);
    expect(detections.length).toBeGreaterThan(0);
    for (const detection of detections) {
      expect(detection.preview).not.toContain(FAKE_GITHUB_TOKEN);
      expect(detection.preview).toContain('****');
    }
  });

  it('redacts every match and leaves ordinary text alone', () => {
    const redacted = redactSecrets(`key ${FAKE_ANTHROPIC_KEY} and token ${FAKE_GITHUB_TOKEN}`);
    expect(redacted).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(redacted).not.toContain(FAKE_GITHUB_TOKEN);
    expect(redacted).toContain('[REDACTED]');
    expect(redactSecrets('nothing sensitive here')).toBe('nothing sensitive here');
  });

  it('finds a match regardless of position across repeated calls', () => {
    // Guards the lastIndex hazard: a shared global regex would miss the second
    // call because its lastIndex survived the first.
    const input = `lead ${FAKE_GITHUB_TOKEN}`;
    expect(containsSecrets(input)).toBe(true);
    expect(containsSecrets(input)).toBe(true);
  });
});
