import { describe, it, expect } from 'vitest';
import { PERKS } from '../perks';
import type { Perk } from '../perks';

describe('PERKS data integrity', () => {
  it('has at least one perk', () => {
    expect(PERKS.length).toBeGreaterThan(0);
  });

  it('every perk has required fields', () => {
    for (const perk of PERKS) {
      expect(perk.id, `${perk.id} must have id`).toBeTruthy();
      expect(perk.partner, `${perk.id} must have partner`).toBeTruthy();
      expect(perk.title, `${perk.id} must have title`).toBeTruthy();
      expect(perk.description, `${perk.id} must have description`).toBeTruthy();
      expect(perk.ctaUrl, `${perk.id} must have ctaUrl`).toBeTruthy();
      expect(perk.ctaText, `${perk.id} must have ctaText`).toBeTruthy();
    }
  });

  it('perk ids are unique', () => {
    const ids = PERKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('perk descriptions contain no em-dashes', () => {
    for (const perk of PERKS) {
      expect(perk.description, `${perk.id} description must not use em-dash`).not.toMatch(/—/);
      expect(perk.title, `${perk.id} title must not use em-dash`).not.toMatch(/—/);
    }
  });

  it('ctaUrl is a valid mailto or https link', () => {
    for (const perk of PERKS) {
      const isValid = perk.ctaUrl.startsWith('mailto:') || perk.ctaUrl.startsWith('https://');
      expect(isValid, `${perk.id} ctaUrl must be mailto: or https://`).toBe(true);
    }
  });
});

describe('Perk type shape', () => {
  it('logoUrl is optional', () => {
    const minimal: Perk = {
      id: 'test',
      partner: 'Test Co',
      title: 'Test Perk',
      description: 'A test perk.',
      ctaUrl: 'mailto:test@example.com',
      ctaText: 'Claim',
    };
    expect(minimal.logoUrl).toBeUndefined();
  });
});
