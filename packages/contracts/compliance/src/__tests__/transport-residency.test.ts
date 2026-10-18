import { describe, expect, it } from 'vitest';

import { CHINESE_HQ_PROVIDER_IDS } from '../provider-jurisdiction';
import { NON_US_VENDOR_TRANSPORTS, isNonUsVendorTransport } from '../transport-residency';

describe('transport residency', () => {
  it('places the vendor-run endpoints it does know', () => {
    for (const transport of NON_US_VENDOR_TRANSPORTS) {
      expect(isNonUsVendorTransport(transport)).toBe(true);
    }
  });

  /**
   * The two lists answer different questions, so they are allowed to differ,
   * but not by accident.
   *
   * Every Chinese-HQ vendor runs its own endpoint, so each one must appear
   * here. The reverse does not hold: this list also carries the
   * Anthropic-protocol endpoints, which are transports rather than vendors,
   * and MiniMax, which the Chinese-HQ list omits while the routing catalog's
   * own `usOnly` policy includes it.
   */
  it('covers every vendor the jurisdiction list names', () => {
    for (const vendor of CHINESE_HQ_PROVIDER_IDS) {
      expect(isNonUsVendorTransport(vendor)).toBe(true);
    }
  });

  it('does not place a United States gateway as non-US', () => {
    for (const gateway of ['open_router', 'vercel_gateway', 'together', 'novita', 'bedrock']) {
      expect(isNonUsVendorTransport(gateway)).toBe(false);
    }
  });
});
