import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  IDENTITY_SECURITY_EVENT_KEYS,
  IDENTITY_SECURITY_EVENTS,
} from '@/lib/services/identity-events/catalogue';
import {
  FACTOR_CHANGE_EVENTS,
  RISK_SIGNALS,
  assessRisk,
  type RiskContext,
  type RiskObservation,
} from '@/lib/server/risk-signals';

const WEB_ROOT = path.resolve(import.meta.dirname, '../..');
const RISK_SOURCE = fs.readFileSync(path.join(WEB_ROOT, 'lib/server/risk-signals.ts'), 'utf8');

const AT = Date.parse('2026-09-20T12:00:00.000Z');

function at(offsetMs: number): string {
  return new Date(AT + offsetMs).toISOString();
}

function observation(overrides: Partial<RiskObservation> = {}): RiskObservation {
  return {
    eventKey: 'new_sign_in',
    outcome: 'success',
    ipHash: 'hash',
    country: 'US',
    latitude: null,
    longitude: null,
    deviceRef: 'device-known',
    userAgentRef: 'client-known',
    surface: 'web',
    observedAt: at(0),
    ...overrides,
  };
}

/**
 * Each signal with the smallest history that produces it. Enumerated from
 * RISK_SIGNALS so a signal added to the engine without a way to reach it
 * fails here rather than sitting unreachable.
 */
const REACHES: Readonly<
  Record<
    (typeof RISK_SIGNALS)[number],
    { history: RiskObservation[]; current: RiskObservation; context?: RiskContext }
  >
> = {
  new_device: {
    history: [observation({ observedAt: at(-86_400_000) })],
    current: observation({ deviceRef: 'device-unseen' }),
  },
  new_browser: {
    history: [observation({ observedAt: at(-86_400_000) })],
    current: observation({ userAgentRef: 'client-unseen' }),
  },
  credential_stuffing: {
    history: [],
    current: observation(),
    context: { otherAccountsFailedFromAddress: 3 },
  },
  recovery_attempt: {
    history: [],
    current: observation({ eventKey: 'recovery_requested' }),
  },
  new_location: {
    history: [observation({ observedAt: at(-86_400_000) })],
    current: observation({ country: 'DE' }),
  },
  impossible_travel: {
    history: [
      observation({ observedAt: at(-3_600_000), latitude: 51.5, longitude: -0.12, country: 'GB' }),
    ],
    current: observation({ latitude: 40.71, longitude: -74.01 }),
  },
  repeated_auth_failures: {
    history: Array.from({ length: 5 }, (_, index) =>
      observation({ outcome: 'failure', observedAt: at(-60_000 * (index + 1)) }),
    ),
    current: observation({ outcome: 'failure' }),
  },
  new_device_with_factor_change: {
    history: [
      observation({ observedAt: at(-86_400_000) }),
      observation({ eventKey: 'passkey_added', observedAt: at(-600_000) }),
    ],
    current: observation({ deviceRef: 'device-unseen' }),
  },
};

/**
 * Nothing the engine reads may stand in for who a person is. An inference
 * drawn from any of these would refuse sign-ins along a protected line while
 * looking like a security control.
 */
const PROTECTED_ATTRIBUTES: readonly (string | RegExp)[] = [
  'gender',
  'sex',
  // A prefix match would read the client header name as an age.
  /\bage(?![a-z])/i,
  'birth',
  'dob',
  'ethnic',
  'race',
  'religio',
  'disab',
  'pregnan',
  'marital',
  'orientation',
  'nationality',
  'citizenship',
  'language',
  'locale',
  'given_name',
  'givenName',
  'family_name',
  'familyName',
  'full_name',
  'fullName',
  'avatar',
  'photo',
];

describe('the risk engine speaks one vocabulary with the identity catalogue', () => {
  it('reaches every signal it declares', () => {
    for (const signal of RISK_SIGNALS) {
      const fixture = REACHES[signal];
      expect(fixture, `${signal} has no history that produces it`).toBeDefined();
      expect(
        assessRisk(fixture.history, fixture.current, fixture.context).signals,
        `${signal} is declared but unreachable`,
      ).toContain(signal);
    }
  });

  it('declares a fixture for every signal and no signal it retired', () => {
    expect(Object.keys(REACHES).sort()).toEqual([...RISK_SIGNALS].sort());
  });

  it('raises a factor change on an unknown device to compromise, never lower', () => {
    const fixture = REACHES.new_device_with_factor_change;
    expect(assessRisk(fixture.history, fixture.current).level).toBe('compromise');
  });

  it('pairs the factor change with an event the catalogue actually emits', () => {
    expect(FACTOR_CHANGE_EVENTS.size).toBeGreaterThan(0);
    const unknown = [...FACTOR_CHANGE_EVENTS].filter(
      (event) => !(IDENTITY_SECURITY_EVENT_KEYS as readonly string[]).includes(event),
    );
    expect(
      unknown,
      `the risk engine waits for events the identity catalogue never writes, so the pairing ` +
        `silently never fires: ${unknown.join(', ')}`,
    ).toEqual([]);
  });

  it('covers a change to each credential a person signs in with', () => {
    for (const event of [
      'password_changed',
      'email_changed',
      'passkey_added',
      'backup_codes_regenerated',
      'two_factor_disabled',
      'recovery_requested',
    ]) {
      expect(FACTOR_CHANGE_EVENTS.has(event), `${event} is not treated as a change of factor`).toBe(
        true,
      );
    }
  });

  it('gives every catalogue event a trail entry and somewhere to act', () => {
    for (const key of IDENTITY_SECURITY_EVENT_KEYS) {
      const spec = IDENTITY_SECURITY_EVENTS[key];
      expect(spec.auditEventType.length, `${key} writes no audit type`).toBeGreaterThan(0);
      expect(spec.settingsSection.length, `${key} ends nowhere`).toBeGreaterThan(0);
      expect(spec.message, `${key} tells the reader nothing to do`).toMatch(/secure your account/i);
    }
  });

  it('scores on the server and nowhere else', () => {
    expect(RISK_SOURCE).toMatch(/^import 'server-only';/m);
  });

  it('infers nothing from who a person is', () => {
    const found = PROTECTED_ATTRIBUTES.filter((attribute) =>
      (attribute instanceof RegExp ? attribute : new RegExp(`\\b${attribute}`, 'i')).test(
        RISK_SOURCE,
      ),
    ).map(String);
    expect(
      found,
      `the risk engine reads an attribute that describes the person rather than the request: ` +
        `${found.join(', ')}`,
    ).toEqual([]);
  });

  it('keeps the address out of the record it writes', () => {
    expect(RISK_SOURCE).toMatch(/ipHash:/);
    expect(RISK_SOURCE).not.toMatch(/\bipAddress\b|\bip:\s*ip\b/);
  });

  it('never scores a first sign-in as anything', () => {
    expect(assessRisk([], observation({ deviceRef: 'device-unseen', country: 'JP' }))).toEqual({
      level: 'none',
      signals: [],
    });
  });
});
