/**
 * Tiny in-memory ledger doubles used by every test file. Lives under
 * __tests__ so it ships zero bytes to dist.
 */

import type { DisclosureLedger, DisclosureRecord } from '../article50-disclosure';
import type { ConsentLedger, NamedProviderConsent } from '../provider-jurisdiction';

export class InMemoryDisclosureLedger implements DisclosureLedger {
  private record: DisclosureRecord | null = null;
  read(): DisclosureRecord | null {
    return this.record;
  }
  write(record: DisclosureRecord): void {
    this.record = record;
  }
  reset(): void {
    this.record = null;
  }
}

export class InMemoryConsentLedger implements ConsentLedger {
  private readonly store = new Map<string, NamedProviderConsent>();
  getNamedProviderConsent(providerId: string): NamedProviderConsent | null {
    return this.store.get(providerId) ?? null;
  }
  optIn(providerId: string): void {
    this.store.set(providerId, {
      providerId,
      accepted: true,
      acceptedAt: '2026-05-17T00:00:00.000Z',
      disclosureVersion: 'test',
      surface: 'mobile',
    });
  }
  optOut(providerId: string): void {
    this.store.set(providerId, {
      providerId,
      accepted: false,
      acceptedAt: '2026-05-17T00:00:00.000Z',
      disclosureVersion: 'test',
      surface: 'mobile',
    });
  }
}
