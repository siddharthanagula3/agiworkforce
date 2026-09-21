import { parseMobileIapCatalogResponse } from '@/src/features/billing/mobileIapService';

function disabledCatalog(extra: Record<string, unknown>) {
  return {
    enabled: false,
    platform: 'android',
    appAccountToken: null,
    products: [],
    unavailableReason: 'Paid upgrades are opening in stages.',
    ...extra,
  };
}

describe('native catalog parsing', () => {
  it('carries the upgrade-gate reason through to the client', () => {
    const catalog = parseMobileIapCatalogResponse(
      disabledCatalog({ unavailableCode: 'waitlist_access_required' }),
    );

    expect(catalog.unavailableCode).toBe('waitlist_access_required');
    expect(catalog.enabled).toBe(false);
    expect(catalog.products).toEqual([]);
  });

  it('reads a server that sends no reason code as an unavailable catalog', () => {
    expect(parseMobileIapCatalogResponse(disabledCatalog({})).unavailableCode).toBeNull();
    expect(
      parseMobileIapCatalogResponse(disabledCatalog({ unavailableCode: 'something_else' }))
        .unavailableCode,
    ).toBeNull();
  });
});
