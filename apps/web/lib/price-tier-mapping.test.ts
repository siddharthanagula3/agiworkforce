import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getEnterpriseProductId, isEnterpriseProductId } from './price-tier-mapping';

const ORIGINAL_STRIPE_PRODUCT_ENTERPRISE = process.env['STRIPE_PRODUCT_ENTERPRISE'];

describe('enterprise product identification', () => {
  beforeEach(() => {
    delete process.env['STRIPE_PRODUCT_ENTERPRISE'];
  });

  afterEach(() => {
    if (ORIGINAL_STRIPE_PRODUCT_ENTERPRISE === undefined) {
      delete process.env['STRIPE_PRODUCT_ENTERPRISE'];
    } else {
      process.env['STRIPE_PRODUCT_ENTERPRISE'] = ORIGINAL_STRIPE_PRODUCT_ENTERPRISE;
    }
  });

  it('reads the configured enterprise product id', () => {
    process.env['STRIPE_PRODUCT_ENTERPRISE'] = 'prod_enterprise_123';
    expect(getEnterpriseProductId()).toBe('prod_enterprise_123');
  });

  it('returns null when unset or blank', () => {
    expect(getEnterpriseProductId()).toBeNull();
    process.env['STRIPE_PRODUCT_ENTERPRISE'] = '   ';
    expect(getEnterpriseProductId()).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    process.env['STRIPE_PRODUCT_ENTERPRISE'] = '  prod_enterprise_123  ';
    expect(getEnterpriseProductId()).toBe('prod_enterprise_123');
  });

  it('matches only the configured enterprise product id', () => {
    process.env['STRIPE_PRODUCT_ENTERPRISE'] = 'prod_enterprise_123';
    expect(isEnterpriseProductId('prod_enterprise_123')).toBe(true);
    expect(isEnterpriseProductId('prod_other')).toBe(false);
    expect(isEnterpriseProductId(null)).toBe(false);
    expect(isEnterpriseProductId(undefined)).toBe(false);
  });

  it('fails closed when no enterprise product is configured', () => {
    expect(isEnterpriseProductId('prod_anything')).toBe(false);
  });
});
