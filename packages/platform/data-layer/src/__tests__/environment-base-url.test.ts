import { describe, expect, it } from 'vitest';

import { APP_BASE_URL_VAR, resolveEnvironmentBaseUrl } from '../environment-isolation';
import { DataLayerConfigError } from '../types';

const DEPLOYED_ORIGIN = 'https://app.example.test';

describe('resolveEnvironmentBaseUrl', () => {
  it('serves loopback when a local runtime configures nothing', () => {
    expect(resolveEnvironmentBaseUrl({ NODE_ENV: 'development' })).toBe('http://127.0.0.1:3000');
    expect(resolveEnvironmentBaseUrl({ NODE_ENV: 'test', PORT: '3100' })).toBe(
      'http://127.0.0.1:3100',
    );
  });

  it('refuses a deployed origin from a development runtime', () => {
    expect(() =>
      resolveEnvironmentBaseUrl({ NODE_ENV: 'development', [APP_BASE_URL_VAR]: DEPLOYED_ORIGIN }),
    ).toThrow(DataLayerConfigError);
  });

  it('refuses a deployed runtime that names no origin, rather than guessing one', () => {
    expect(() => resolveEnvironmentBaseUrl({ VERCEL_ENV: 'production' })).toThrow(
      DataLayerConfigError,
    );
  });

  it('requires https once deployed and drops the trailing slash', () => {
    expect(() =>
      resolveEnvironmentBaseUrl({
        VERCEL_ENV: 'preview',
        [APP_BASE_URL_VAR]: 'http://preview.example.test',
      }),
    ).toThrow(/https/);
    expect(
      resolveEnvironmentBaseUrl({
        VERCEL_ENV: 'production',
        [APP_BASE_URL_VAR]: `${DEPLOYED_ORIGIN}/`,
      }),
    ).toBe(DEPLOYED_ORIGIN);
  });

  it('rejects a value that is not a URL', () => {
    expect(() =>
      resolveEnvironmentBaseUrl({ VERCEL_ENV: 'production', [APP_BASE_URL_VAR]: 'app.example' }),
    ).toThrow(DataLayerConfigError);
  });
});
