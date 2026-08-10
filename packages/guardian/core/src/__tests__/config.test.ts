import { describe, expect, it } from 'vitest';

import { defaultGuardianConfig, matchesIgnorePath, parseGuardianConfig } from '../config.js';

describe('parseGuardianConfig', () => {
  it('returns fail-closed defaults for missing config', () => {
    const parsed = parseGuardianConfig(null);
    expect(parsed.source).toBe('default');
    expect(parsed.errors).toEqual([]);
    expect(parsed.config.mode).toBe('shadow');
    expect(parsed.config.blocking.existing_debt).toBe(false);
  });

  it('fails closed to shadow defaults on invalid YAML, with reasons', () => {
    const parsed = parseGuardianConfig('mode: [unclosed');
    expect(parsed.source).toBe('default');
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.config.mode).toBe('shadow');
  });

  it('fails closed on schema violations rather than partially trusting the config', () => {
    const parsed = parseGuardianConfig('mode: blocking\nreview:\n  max_inline_comments: 999\n');
    expect(parsed.source).toBe('default');
    expect(parsed.config.mode).toBe('shadow');
    expect(parsed.errors.join(' ')).toContain('max_inline_comments');
  });

  it('fails closed on a non-mapping root', () => {
    const parsed = parseGuardianConfig('- just\n- a\n- list\n');
    expect(parsed.source).toBe('default');
    expect(parsed.errors).toEqual(['config root must be a mapping']);
  });

  it('parses a valid config and keeps section defaults', () => {
    const parsed = parseGuardianConfig(
      [
        'version: 1',
        'mode: advisory',
        'review:',
        '  max_inline_comments: 5',
        'blocking:',
        '  new_critical: true',
      ].join('\n'),
    );
    expect(parsed.source).toBe('repo');
    expect(parsed.errors).toEqual([]);
    expect(parsed.config.mode).toBe('advisory');
    expect(parsed.config.review.max_inline_comments).toBe(5);
    expect(parsed.config.review.minimum_inline_confidence).toBe(0.88);
    expect(parsed.config.triggers.pull_request.actions).toContain('ready_for_review');
  });

  it('rejects duplicate YAML keys instead of silently taking the last', () => {
    const parsed = parseGuardianConfig('mode: shadow\nmode: blocking\n');
    expect(parsed.source).toBe('default');
    expect(parsed.config.mode).toBe('shadow');
  });
});

describe('matchesIgnorePath', () => {
  const defaults = defaultGuardianConfig().ignore.paths;

  it('matches default generated/build paths', () => {
    expect(matchesIgnorePath('apps/web/generated/client.ts', defaults)).toBe(true);
    expect(matchesIgnorePath('packages/ui/dist/index.js', defaults)).toBe(true);
    expect(matchesIgnorePath('pnpm-lock.lock', defaults)).toBe(true);
  });

  it('does not match production source paths', () => {
    expect(matchesIgnorePath('apps/web/app/api/checkout/route.ts', defaults)).toBe(false);
    expect(matchesIgnorePath('packages/guardian/core/src/schema.ts', defaults)).toBe(false);
  });

  it('supports single-star segment matching', () => {
    expect(matchesIgnorePath('a/b/file.test.ts', ['a/*/file.test.ts'])).toBe(true);
    expect(matchesIgnorePath('a/b/c/file.test.ts', ['a/*/file.test.ts'])).toBe(false);
  });
});
