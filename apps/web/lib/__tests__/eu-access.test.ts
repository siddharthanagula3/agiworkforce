import { describe, expect, it } from 'vitest';
import { EEA_COUNTRY_CODES, decideEuAccess, euBlockEnabled } from '../eu-access';

describe('euBlockEnabled', () => {
  it('is off unless explicitly switched on', () => {
    expect(euBlockEnabled({})).toBe(false);
    expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: '' })).toBe(false);
    expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: 'maybe' })).toBe(false);
  });

  it('accepts the documented truthy and falsy spellings', () => {
    for (const on of ['1', 'true', 'TRUE', 'on']) {
      expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: on })).toBe(true);
    }
    for (const off of ['0', 'false', 'off']) {
      expect(euBlockEnabled({ AGI_BLOCK_EEA_TRAFFIC: off })).toBe(false);
    }
  });
});

describe('decideEuAccess', () => {
  it('serves everyone while the block is off, EEA included', () => {
    expect(decideEuAccess('DE', false)).toEqual({ blocked: false });
    expect(decideEuAccess('FR', false)).toEqual({ blocked: false });
  });

  it('refuses every EEA country when the block is on', () => {
    for (const code of EEA_COUNTRY_CODES) {
      expect(decideEuAccess(code, true)).toEqual({ blocked: true, country: code });
    }
  });

  it('serves non-EEA countries when the block is on', () => {
    for (const code of ['US', 'IN', 'GB', 'CA', 'AU', 'BR', 'CH', 'JP']) {
      expect(decideEuAccess(code, true)).toEqual({ blocked: false });
    }
  });

  it('does not block when the country header is absent or unreadable', () => {
    expect(decideEuAccess(null, true)).toEqual({ blocked: false });
    expect(decideEuAccess(undefined, true)).toEqual({ blocked: false });
    expect(decideEuAccess('  ', true)).toEqual({ blocked: false });
  });

  it('matches the header case-insensitively', () => {
    expect(decideEuAccess('de', true)).toEqual({ blocked: true, country: 'DE' });
    expect(decideEuAccess(' fr ', true)).toEqual({ blocked: true, country: 'FR' });
  });

  it('excludes the UK and Switzerland, which are not EEA', () => {
    expect(decideEuAccess('GB', true)).toEqual({ blocked: false });
    expect(decideEuAccess('CH', true)).toEqual({ blocked: false });
  });
});
