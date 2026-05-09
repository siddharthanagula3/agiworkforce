import { describe, expect, it } from 'vitest';

import { detectGateway, gatewayEnforcesUserSideLimits } from '../gateway';

describe('detectGateway', () => {
  it('returns direct when no signal matches', () => {
    expect(detectGateway({})).toEqual({ id: 'direct', headerPrefix: '', hostnameSuffix: '' });
  });

  it('matches LiteLLM via x-litellm- header prefix', () => {
    const r = detectGateway({
      responseHeaders: { 'x-litellm-version': '1.0.0' },
    });
    expect(r.id).toBe('litellm');
    expect(r.headerPrefix).toBe('x-litellm-');
  });

  it('matches Helicone via Headers instance', () => {
    const h = new Headers({ 'x-helicone-id': 'abc' });
    expect(detectGateway({ responseHeaders: h }).id).toBe('helicone');
  });

  it('matches Portkey via x-portkey- prefix', () => {
    expect(detectGateway({ responseHeaders: { 'x-portkey-id': '1' } }).id).toBe('portkey');
  });

  it('matches Cloudflare AI Gateway via cf-aig- prefix', () => {
    expect(detectGateway({ responseHeaders: { 'cf-aig-cache-status': 'HIT' } }).id).toBe(
      'cloudflare-ai-gateway',
    );
  });

  it('matches Kong via x-kong- prefix', () => {
    expect(detectGateway({ responseHeaders: { 'x-kong-upstream-latency': '20' } }).id).toBe('kong');
  });

  it('matches Braintrust via x-bt- prefix', () => {
    expect(detectGateway({ responseHeaders: { 'x-bt-trace-id': 'x' } }).id).toBe('braintrust');
  });

  it('matches Databricks via x-databricks- prefix', () => {
    expect(detectGateway({ responseHeaders: { 'x-databricks-org-id': 'org' } }).id).toBe(
      'databricks',
    );
  });

  it('falls back to URL match when no header signal', () => {
    expect(
      detectGateway({
        baseUrl: 'https://my-stack.litellm.ai/v1',
      }).id,
    ).toBe('litellm');
    expect(
      detectGateway({
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/abc',
      }).id,
    ).toBe('cloudflare-ai-gateway');
  });

  it('header match wins over URL match', () => {
    const r = detectGateway({
      responseHeaders: { 'x-helicone-id': 'h1' },
      baseUrl: 'https://my.litellm.ai',
    });
    expect(r.id).toBe('helicone');
  });

  it('handles invalid URLs gracefully', () => {
    expect(detectGateway({ baseUrl: 'not-a-url' }).id).toBe('direct');
    expect(detectGateway({ baseUrl: '' }).id).toBe('direct');
  });
});

describe('gatewayEnforcesUserSideLimits', () => {
  it('returns true for known gateways', () => {
    expect(gatewayEnforcesUserSideLimits('litellm')).toBe(true);
    expect(gatewayEnforcesUserSideLimits('helicone')).toBe(true);
    expect(gatewayEnforcesUserSideLimits('portkey')).toBe(true);
    expect(gatewayEnforcesUserSideLimits('cloudflare-ai-gateway')).toBe(true);
  });

  it('returns false for direct', () => {
    expect(gatewayEnforcesUserSideLimits('direct')).toBe(false);
  });
});
