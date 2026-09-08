import { describe, expect, it } from 'vitest';

import { applyEnvFile, parseEnvFile, type MutableEnv } from '../e2e/lib/env-file';

const FILE = [
  '# a comment',
  '',
  'PLAYWRIGHT_BASE_URL=http://localhost:3000',
  'STRIPE_SECRET_KEY="sk_live_from_the_developer"',
  'EMPTY=',
].join('\n');

describe('the browser test env loader fills gaps rather than overwriting', () => {
  it('reads keys, strips quotes and skips comments and blanks', () => {
    expect(parseEnvFile(FILE)).toEqual({
      PLAYWRIGHT_BASE_URL: 'http://localhost:3000',
      STRIPE_SECRET_KEY: 'sk_live_from_the_developer',
    });
  });

  it('leaves a value the operator exported alone', () => {
    const env: MutableEnv = { PLAYWRIGHT_BASE_URL: 'http://localhost:3100' };

    const result = applyEnvFile(FILE, env);

    expect(env['PLAYWRIGHT_BASE_URL']).toBe('http://localhost:3100');
    expect(result.keptFromProcess).toContain('PLAYWRIGHT_BASE_URL');
  });

  it('still fills a key the environment does not carry', () => {
    const env: MutableEnv = {};

    const result = applyEnvFile(FILE, env);

    expect(env['STRIPE_SECRET_KEY']).toBe('sk_live_from_the_developer');
    expect(result.applied).toContain('STRIPE_SECRET_KEY');
  });

  it('treats an empty exported value as absent, so a deliberate blank is refilled', () => {
    const env: MutableEnv = { STRIPE_SECRET_KEY: '' };

    applyEnvFile(FILE, env);

    expect(env['STRIPE_SECRET_KEY']).toBe('sk_live_from_the_developer');
  });
});
