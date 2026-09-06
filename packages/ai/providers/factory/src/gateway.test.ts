import { describe, expect, it } from 'vitest';

import { createGatewayAdapter, gatewayDiscountBody, type GatewayDefinition } from './gateway';

const BASE_URL_ENV = 'TEST_GATEWAY_BASE_URL';
const API_KEY_ENV = 'TEST_GATEWAY_API_KEY';
const BASE_URL = 'https://gateway.example.test/v1';
const API_KEY = 'test-gateway-key';
const REQUEST_FIELD = 'min_discount_percent';
const MIN_PERCENT = 30;

function definition(overrides: Partial<GatewayDefinition> = {}): GatewayDefinition {
  return {
    id: 'test_gateway',
    displayName: 'Test Gateway',
    protocol: 'openai_chat_completions',
    baseUrlEnv: BASE_URL_ENV,
    apiKeyEnv: API_KEY_ENV,
    modelsSource: { kind: 'static' },
    pricingSource: { kind: 'static' },
    host: 'gateway.example.test',
    governance: { dataRetentionClass: 'unknown', trainsOnInputs: 'unknown' },
    ...overrides,
  };
}

describe('gatewayDiscountBody', () => {
  it('is absent when the gateway declares no discount policy', () => {
    expect(gatewayDiscountBody(undefined)).toBeUndefined();
  });

  it('names the request field the gateway documents with the policy minimum', () => {
    expect(gatewayDiscountBody({ requestField: REQUEST_FIELD, minPercent: MIN_PERCENT })).toEqual({
      [REQUEST_FIELD]: MIN_PERCENT,
    });
  });
});

describe('createGatewayAdapter', () => {
  it('builds an adapter for a discount gateway from env names alone', () => {
    const adapter = createGatewayAdapter(
      definition({ discount: { requestField: REQUEST_FIELD, minPercent: MIN_PERCENT } }),
      { [BASE_URL_ENV]: BASE_URL, [API_KEY_ENV]: API_KEY },
    );
    expect(adapter.id).toBe('test_gateway');
    expect(adapter.config.baseUrl).toBe(BASE_URL);
    expect((adapter.config as { extraBody?: Record<string, unknown> }).extraBody).toEqual({
      [REQUEST_FIELD]: MIN_PERCENT,
    });
  });
});
