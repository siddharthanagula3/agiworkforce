import { afterEach, describe, expect, it } from 'vitest';

import {
  KEY_VALUE_PROVIDER_ENV,
  KEY_VALUE_REDIS_URL_ENV,
  resolveKeyValueRuntime,
  selectKeyValueProvider,
} from '../factory';
import { KeyValueConfigError } from '../types';

const UPSTASH_URL_ENV = 'UPSTASH_REDIS_REST_URL';
const UPSTASH_TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN';
const VERCEL_KV_URL_ENV = 'KV_REST_API_URL';
const VERCEL_KV_TOKEN_ENV = 'KV_REST_API_TOKEN';

const OWNED_ENV_NAMES = [
  KEY_VALUE_PROVIDER_ENV,
  KEY_VALUE_REDIS_URL_ENV,
  UPSTASH_URL_ENV,
  UPSTASH_TOKEN_ENV,
  VERCEL_KV_URL_ENV,
  VERCEL_KV_TOKEN_ENV,
];

afterEach(() => {
  for (const name of OWNED_ENV_NAMES) delete process.env[name];
});

describe('key-value provider selection', () => {
  it('selects none when nothing is configured', () => {
    expect(selectKeyValueProvider()).toBe('none');
    expect(resolveKeyValueRuntime()).toMatchObject({
      provider: 'none',
      store: null,
      rateLimiter: null,
    });
  });

  it('selects upstash from the Upstash credential names', () => {
    process.env[UPSTASH_URL_ENV] = 'https://example.upstash.io';
    process.env[UPSTASH_TOKEN_ENV] = 'token';
    expect(selectKeyValueProvider()).toBe('upstash');
  });

  it('selects upstash from the Vercel KV credential names', () => {
    process.env[VERCEL_KV_URL_ENV] = 'https://example.upstash.io';
    process.env[VERCEL_KV_TOKEN_ENV] = 'token';
    expect(selectKeyValueProvider()).toBe('upstash');
  });

  it('selects redis when only a local url is configured', () => {
    process.env[KEY_VALUE_REDIS_URL_ENV] = 'redis://127.0.0.1:6379';
    expect(selectKeyValueProvider()).toBe('redis');

    const runtime = resolveKeyValueRuntime();
    expect(runtime.provider).toBe('redis');
    expect(runtime.store).not.toBeNull();
    expect(runtime.rateLimiter).not.toBeNull();
  });

  it('lets the explicit provider override the credentials that are present', () => {
    process.env[UPSTASH_URL_ENV] = 'https://example.upstash.io';
    process.env[UPSTASH_TOKEN_ENV] = 'token';
    process.env[KEY_VALUE_PROVIDER_ENV] = 'memory';

    const runtime = resolveKeyValueRuntime();
    expect(runtime.provider).toBe('memory');
    expect(runtime.store).not.toBeNull();
  });

  it('builds an upstash runtime from an injected client without reading credentials', () => {
    const runtime = resolveKeyValueRuntime({ upstashClient: {} as never });
    expect(runtime.provider).toBe('upstash');
    expect(runtime.store).not.toBeNull();
    expect(runtime.rateLimiter).not.toBeNull();
  });

  it('refuses an unrecognised provider name rather than guessing', () => {
    process.env[KEY_VALUE_PROVIDER_ENV] = 'memcached';
    expect(() => selectKeyValueProvider()).toThrow(KeyValueConfigError);
  });

  it('refuses the redis provider without a connection url', () => {
    process.env[KEY_VALUE_PROVIDER_ENV] = 'redis';
    expect(() => resolveKeyValueRuntime()).toThrow(KeyValueConfigError);
  });

  it('refuses the upstash provider without credentials', () => {
    process.env[KEY_VALUE_PROVIDER_ENV] = 'upstash';
    expect(() => resolveKeyValueRuntime()).toThrow(KeyValueConfigError);
  });
});
