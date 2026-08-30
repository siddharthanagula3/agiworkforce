import { describe, expect, it } from 'vitest';

import {
  ALLOWED_MANAGED_PROVIDER_HOSTS,
  resolveValidatedBaseUrl,
  validateBaseUrl,
} from '../base-url';

describe('validateBaseUrl', () => {
  const options = { allowedHosts: ['api.example.com', 'api.other.com'] };

  it('accepts an https URL on an allowlisted host', () => {
    const result = validateBaseUrl('https://api.example.com/v1', options);
    expect(result).toEqual({
      ok: true,
      url: 'https://api.example.com/v1',
      hostname: 'api.example.com',
    });
  });

  it('matches hosts case-insensitively', () => {
    const result = validateBaseUrl('https://API.EXAMPLE.COM/v1', options);
    expect(result.ok).toBe(true);
  });

  it('rejects an empty/undefined candidate', () => {
    expect(validateBaseUrl(undefined, options)).toEqual({ ok: false, reason: 'empty', input: '' });
    expect(validateBaseUrl('   ', options)).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('rejects an unparsable URL', () => {
    const result = validateBaseUrl('not a url', options);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-url' });
  });

  it('rejects a host not on the allowlist (SSRF guard)', () => {
    const result = validateBaseUrl('https://evil.attacker.com/v1', options);
    expect(result).toMatchObject({
      ok: false,
      reason: 'host-not-allowlisted',
      hostname: 'evil.attacker.com',
    });
  });

  it('rejects http on a non-carved-out host even if allowlisted', () => {
    const result = validateBaseUrl('http://api.example.com/v1', options);
    expect(result).toMatchObject({ ok: false, reason: 'insecure-protocol' });
  });

  it('allows http on an explicit insecure-host carve-out', () => {
    const result = validateBaseUrl('http://localhost:11434/v1', {
      allowedHosts: ['localhost'],
    });
    expect(result).toEqual({
      ok: true,
      url: 'http://localhost:11434/v1',
      hostname: 'localhost',
    });
  });

  it('rejects http on localhost when allowInsecureHosts is explicitly narrowed to []', () => {
    const result = validateBaseUrl('http://localhost:11434/v1', {
      allowedHosts: ['localhost'],
      allowInsecureHosts: [],
    });
    expect(result).toMatchObject({ ok: false, reason: 'insecure-protocol' });
  });

  it('accepts a Set for allowedHosts', () => {
    const result = validateBaseUrl('https://api.example.com', {
      allowedHosts: new Set(['api.example.com']),
    });
    expect(result.ok).toBe(true);
  });
});

describe('managed provider host allowlist', () => {
  it('admits both Qwen Model Studio deployment scopes', () => {
    // A QwenCloud key is issued against exactly one scope. Allowlisting only
    // the mainland host silently refuses an international operator's
    // QWEN_BASE_URL override as SSRF and leaves Qwen unusable for them.
    expect(ALLOWED_MANAGED_PROVIDER_HOSTS.has('dashscope.aliyuncs.com')).toBe(true);
    expect(ALLOWED_MANAGED_PROVIDER_HOSTS.has('dashscope-intl.aliyuncs.com')).toBe(true);
  });

  it('accepts an international Qwen base URL override', () => {
    const result = validateBaseUrl('https://dashscope-intl.aliyuncs.com/compatible-mode/v1', {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    expect(result.ok).toBe(true);
  });

  it('still refuses a look-alike host outside the allowlist', () => {
    const result = validateBaseUrl('https://dashscope-intl.aliyuncs.com.evil.test/v1', {
      allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
    });
    expect(result.ok).toBe(false);
  });
});

describe('resolveValidatedBaseUrl', () => {
  const options = { allowedHosts: ['api.example.com'] };
  const defaultUrl = 'https://api.example.com/v1';

  it('returns the default when no candidate is supplied', () => {
    expect(resolveValidatedBaseUrl(undefined, defaultUrl, options)).toEqual({ url: defaultUrl });
  });

  it('returns the candidate when it validates', () => {
    const result = resolveValidatedBaseUrl('https://api.example.com/v2', defaultUrl, options);
    expect(result.url).toBe('https://api.example.com/v2');
    expect(result.rejected).toBeUndefined();
  });

  it('falls back to the default and surfaces the rejection when the candidate is disallowed', () => {
    const result = resolveValidatedBaseUrl('https://evil.attacker.com', defaultUrl, options);
    expect(result.url).toBe(defaultUrl);
    expect(result.rejected).toMatchObject({ ok: false, reason: 'host-not-allowlisted' });
  });
});
