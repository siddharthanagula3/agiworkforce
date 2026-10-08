import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  UNSERVED_COUNTRIES,
  UNSERVED_SUBDIVISIONS,
  isUnderUsSanctions,
} from '@agiworkforce/compliance/service-regions';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import SupportedCountriesPage from './page';

function ledgerValue(label: string): string {
  const row = screen.getByText(label).closest('li');
  return row?.querySelector('.agi-ds-ledger-value')?.textContent ?? '';
}

describe('SupportedCountriesPage', () => {
  it('prints every place the proxy refuses, in the group its reason puts it in', () => {
    render(<SupportedCountriesPage />);

    const sanctioned = ledgerValue('Barred by United States sanctions');
    const notOffered = ledgerValue('Not offered');
    const places = [...UNSERVED_COUNTRIES, ...UNSERVED_SUBDIVISIONS];

    expect(places.length).toBeGreaterThan(20);
    for (const place of places) {
      const [own, other] = isUnderUsSanctions(place)
        ? [sanctioned, notOffered]
        : [notOffered, sanctioned];
      expect(own, place.name).toContain(place.name);
      expect(other, place.name).not.toContain(place.name);
    }
  });

  it('names the comprehensive embargoes under sanctions and leaves the rest of Ukraine open', () => {
    render(<SupportedCountriesPage />);

    const sanctioned = ledgerValue('Barred by United States sanctions');
    for (const name of ['Cuba', 'Iran', 'North Korea', 'Crimea (Ukraine)']) {
      expect(sanctioned).toContain(name);
    }
    expect(sanctioned).not.toContain('Syria');
    expect(ledgerValue('Not offered')).not.toMatch(/(^|, )Ukraine/u);
  });
});
