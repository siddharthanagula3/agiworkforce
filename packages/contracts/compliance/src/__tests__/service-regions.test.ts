import { describe, expect, it } from 'vitest';
import {
  SERVICE_REGION_SOURCES,
  UNSERVED_COUNTRIES,
  UNSERVED_SUBDIVISIONS,
  decideServiceRegion,
} from '../service-regions';

describe('the unserved list', () => {
  it('holds each place once, as an ISO 3166 code', () => {
    const codes = UNSERVED_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/u);

    const keys = UNSERVED_SUBDIVISIONS.map((entry) => `${entry.country}-${entry.subdivision}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of UNSERVED_SUBDIVISIONS)
      expect(entry.subdivision).toMatch(/^[0-9A-Z]{1,3}$/u);
  });

  it('gives every place a reason, and every reason a dated source', () => {
    const sourced = new Set(SERVICE_REGION_SOURCES.map((source) => source.id));
    for (const place of [...UNSERVED_COUNTRIES, ...UNSERVED_SUBDIVISIONS]) {
      expect(place.reasons.length, place.name).toBeGreaterThan(0);
      for (const reason of place.reasons) expect(sourced.has(reason), place.name).toBe(true);
    }
    for (const source of SERVICE_REGION_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//u);
      expect(source.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it('marks as sanctioned only the comprehensive embargoes OFAC still runs', () => {
    const sanctioned = [...UNSERVED_COUNTRIES, ...UNSERVED_SUBDIVISIONS]
      .filter((place) => place.reasons.includes('us-sanctions'))
      .map((place) => ('code' in place ? place.code : `${place.country}-${place.subdivision}`))
      .sort();
    expect(sanctioned).toEqual(['CU', 'IR', 'KP', 'UA-09', 'UA-14', 'UA-40', 'UA-43']);
  });
});

describe('decideServiceRegion', () => {
  it('refuses the embargoed countries and the places the two lists leave out', () => {
    for (const code of ['CU', 'IR', 'KP', 'SY', 'RU', 'BY', 'CN', 'HK', 'VE', 'AF', 'EH']) {
      expect(decideServiceRegion(code)).toEqual({ served: false, place: code });
    }
  });

  it('serves the countries both lists name', () => {
    for (const code of ['US', 'GB', 'DE', 'FR', 'IN', 'CA', 'BR', 'JP', 'NG', 'UA', 'CH']) {
      expect(decideServiceRegion(code)).toEqual({ served: true });
    }
  });

  it('serves a territory of a country both lists serve, even one ChatGPT does not name', () => {
    for (const code of ['PR', 'GU', 'VI', 'AS', 'MP', 'JE', 'GG', 'IM', 'GI', 'CW', 'CK', 'NU']) {
      expect(decideServiceRegion(code), code).toEqual({ served: true });
    }
  });

  it('refuses the excluded regions of Ukraine and serves the rest of it', () => {
    for (const region of ['43', '40', '14', '09', '65', '23']) {
      expect(decideServiceRegion('UA', region)).toEqual({ served: false, place: `UA-${region}` });
    }
    for (const region of ['30', '32', '46', '51', '63']) {
      expect(decideServiceRegion('UA', region)).toEqual({ served: true });
    }
  });

  it('reads a region only against its own country', () => {
    expect(decideServiceRegion('US', '43')).toEqual({ served: true });
    expect(decideServiceRegion('UA', null)).toEqual({ served: true });
  });

  it('matches the headers case-insensitively and serves an unknown place', () => {
    expect(decideServiceRegion(' cu ')).toEqual({ served: false, place: 'CU' });
    expect(decideServiceRegion('ua', ' 43 ')).toEqual({ served: false, place: 'UA-43' });
    expect(decideServiceRegion(null)).toEqual({ served: true });
    expect(decideServiceRegion(undefined, '43')).toEqual({ served: true });
    expect(decideServiceRegion('  ')).toEqual({ served: true });
  });
});
