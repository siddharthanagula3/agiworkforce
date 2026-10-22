import { describe, expect, it } from 'vitest';
import {
  BANK_ACCOUNTS_CONNECTOR_ID,
  bankAccountsAvailableOnSurface,
  connectorUnavailableOnSurface,
} from './plaid-config';

describe('bank account tools by surface', () => {
  it('keeps bank tools out of turns the mobile app starts', () => {
    expect(bankAccountsAvailableOnSurface('mobile')).toBe(false);
    expect(connectorUnavailableOnSurface(BANK_ACCOUNTS_CONNECTOR_ID, 'mobile')).toBe(true);
  });

  it('leaves bank tools available on the web and desktop', () => {
    expect(connectorUnavailableOnSurface(BANK_ACCOUNTS_CONNECTOR_ID, 'web')).toBe(false);
    expect(connectorUnavailableOnSurface(BANK_ACCOUNTS_CONNECTOR_ID, 'desktop')).toBe(false);
  });

  it('does not deny any other connector on mobile', () => {
    expect(connectorUnavailableOnSurface('github', 'mobile')).toBe(false);
  });
});
