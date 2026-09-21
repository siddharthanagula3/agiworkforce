import { describe, expect, it } from 'vitest';
import {
  PROHIBITED_MEMORY_CATEGORIES,
  prohibitedMemoryCategory,
  prohibitedMemoryMessage,
  prohibitedMemoryRules,
  type ProhibitedMemoryCategory,
} from '../memory-content-policy';

const REFUSED: { readonly [K in ProhibitedMemoryCategory]: readonly string[] } = {
  credential: [
    `User's password is ${'correct-horse-battery'}`,
    'Remember: my api key is abcd1234efgh5678',
    `authorization: ${'a'.repeat(24)}`,
  ],
  payment_instrument: [
    'User pays with card 4111 1111 1111 1111',
    'The CVV is 731 for that card',
    'My IBAN is GB29NWBK60161331926819',
  ],
  government_identifier: [
    'User SSN is 123-45-6789',
    'My passport number is X1234567',
    'Aadhaar number: 234512345678',
  ],
  health: [
    'User was diagnosed with type 1 diabetes',
    'User is prescribed 20mg daily',
    "User's blood type is O negative",
  ],
  biometric: [
    'User unlocks the laptop with a fingerprint',
    'Store the retina scan reference for the user',
  ],
  precise_location: ['User lives at 221 Baker Street', 'User is usually at 37.774929, -122.419416'],
};

const STORABLE = [
  'User prefers concise answers',
  'User lives in Berlin',
  'User works in cardiology at a teaching hospital',
  'User is a security engineer who reviews token handling',
  'User decided to use TypeScript for the new service',
  'User is building an app for diabetes patients',
  'User speaks German and English',
];

describe('prohibited memory content policy', () => {
  it('gives every declared category at least one rule and a message', () => {
    expect(new Set(PROHIBITED_MEMORY_CATEGORIES).size).toBe(PROHIBITED_MEMORY_CATEGORIES.length);
    for (const category of PROHIBITED_MEMORY_CATEGORIES) {
      expect(prohibitedMemoryRules(category).length).toBeGreaterThan(0);
      expect(prohibitedMemoryMessage(category)).toMatch(/Memory never stores/);
    }
    expect(prohibitedMemoryRules()).toHaveLength(
      PROHIBITED_MEMORY_CATEGORIES.reduce(
        (total, category) => total + prohibitedMemoryRules(category).length,
        0,
      ),
    );
  });

  it('refuses a stated value in every category', () => {
    for (const category of PROHIBITED_MEMORY_CATEGORIES) {
      expect(REFUSED[category].length, `${category} has no fixture`).toBeGreaterThan(0);
      for (const content of REFUSED[category]) {
        expect(prohibitedMemoryCategory(content), content).toBe(category);
      }
    }
  });

  it('gives every rule a unique id and a fixture that reaches it', () => {
    const ids = prohibitedMemoryRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of prohibitedMemoryRules()) {
      const reached = REFUSED[rule.category].some((content) =>
        rule.matches(content.toLowerCase().replace(/\s+/gu, ' ').trim()),
      );
      expect(reached, `no fixture reaches ${rule.id}`).toBe(true);
    }
  });

  it('leaves an ordinary fact storable', () => {
    for (const content of STORABLE) {
      expect(prohibitedMemoryCategory(content), content).toBeNull();
    }
    expect(prohibitedMemoryCategory('')).toBeNull();
    expect(prohibitedMemoryCategory('   ')).toBeNull();
  });

  it('refuses a card number only when the digits check out', () => {
    expect(prohibitedMemoryCategory('User card 4111 1111 1111 1111')).toBe('payment_instrument');
    expect(prohibitedMemoryCategory('User order reference 4111111111111112')).toBeNull();
  });
});
