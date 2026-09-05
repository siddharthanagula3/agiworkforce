import { REGISTRY_ENDPOINT_HOST_RULES, type EndpointHostRule } from '@agiworkforce/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveAnthropicPayloadPolicy } from '../anthropic-payload-policy';
import { resolveBundledOpenAIResponsesEndpointClass } from '../openai-responses-payload-policy';

const HOST_SUFFIX_SAMPLE_LABEL = 'sample';
const VERTEX_SAMPLE_REGION = 'us-central1';
const LONG_CACHE_TTL = '1h';
const CACHE_RETENTION_ENV = 'AGIWORKFORCE_CACHE_RETENTION';

function sampleBaseUrl(rule: EndpointHostRule): string {
  switch (rule.match) {
    case 'baseUrl':
      return rule.pattern;
    case 'host':
      return `https://${rule.pattern}`;
    case 'domain':
      return `https://${rule.pattern}`;
    case 'hostSuffix':
      return rule.hostPattern
        ? `https://${VERTEX_SAMPLE_REGION}${rule.pattern}`
        : `https://${HOST_SUFFIX_SAMPLE_LABEL}${rule.pattern}`;
  }
}

describe('registry-declared endpoint hosts', () => {
  it('declares at least one rule', () => {
    expect(REGISTRY_ENDPOINT_HOST_RULES.length).toBeGreaterThan(0);
  });

  it('classifies every declared endpoint as the class the registry gives it', () => {
    for (const rule of REGISTRY_ENDPOINT_HOST_RULES) {
      expect(resolveBundledOpenAIResponsesEndpointClass(sampleBaseUrl(rule))).toBe(
        rule.endpointClass,
      );
    }
  });

  describe('with the ambient long cache retention requested', () => {
    let previousRetention: string | undefined;

    beforeEach(() => {
      previousRetention = process.env[CACHE_RETENTION_ENV];
      process.env[CACHE_RETENTION_ENV] = 'long';
    });

    afterEach(() => {
      if (previousRetention === undefined) {
        delete process.env[CACHE_RETENTION_ENV];
        return;
      }
      process.env[CACHE_RETENTION_ENV] = previousRetention;
    });

    it('offers the long cache lifetime exactly where the registry declares it', () => {
      for (const rule of REGISTRY_ENDPOINT_HOST_RULES) {
        if (rule.match === 'baseUrl' || rule.match === 'domain') continue;
        const policy = resolveAnthropicPayloadPolicy({
          baseUrl: sampleBaseUrl(rule),
          enableCacheControl: true,
        });
        expect(policy.cacheControl?.ttl).toBe(rule.longTtlPromptCache ? LONG_CACHE_TTL : undefined);
      }
    });
  });

  it('classifies an undeclared public host as custom', () => {
    expect(resolveBundledOpenAIResponsesEndpointClass('https://api.example.invalid/v1')).toBe(
      'custom',
    );
  });
});
