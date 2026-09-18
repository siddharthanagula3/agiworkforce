import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/ip-hash', () => ({
  hashIpAddress: (ip: string) => `${ip.length}`.padStart(64, 'f'),
}));
vi.mock('@/lib/security-audit', () => ({
  getClientIp: (request: Request) => request.headers.get('x-real-ip') ?? undefined,
}));

import {
  assessRisk,
  distanceKm,
  observationFromRequest,
  recordIdentityObservation,
  type RiskObservation,
} from './risk-signals';

type Observation = RiskObservation;

const BASE = '2026-09-18T12:00:00.000Z';

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    eventKey: 'new_sign_in',
    outcome: 'success',
    ipHash: 'hash:a',
    country: 'US',
    latitude: 37.77,
    longitude: -122.42,
    deviceRef: 'device-known',
    surface: 'web',
    observedAt: BASE,
    ...overrides,
  };
}

function minutesBefore(minutes: number): string {
  return new Date(Date.parse(BASE) - minutes * 60_000).toISOString();
}

describe('assessRisk', () => {
  it('reports nothing for the first observation of an account', () => {
    expect(assessRisk([], observation())).toEqual({ level: 'none', signals: [] });
  });

  it('reports nothing when the device and country are already known', () => {
    const history = [observation({ observedAt: minutesBefore(120) })];
    expect(assessRisk(history, observation())).toEqual({ level: 'none', signals: [] });
  });

  it('raises a new device and a new location to elevated, not compromise', () => {
    const history = [observation({ observedAt: minutesBefore(600) })];
    const current = observation({ deviceRef: 'device-unseen', country: 'FR' });

    const assessment = assessRisk(history, current);

    expect(assessment.level).toBe('elevated');
    expect(assessment.signals).toEqual(['new_device', 'new_location']);
  });

  it('treats a new device arriving after a factor change as a compromise', () => {
    const history = [
      observation({ eventKey: 'password_changed', observedAt: minutesBefore(20) }),
      observation({ observedAt: minutesBefore(600) }),
    ];

    const assessment = assessRisk(history, observation({ deviceRef: 'device-unseen' }));

    expect(assessment.level).toBe('compromise');
    expect(assessment.signals).toContain('new_device_with_factor_change');
  });

  it('does not fire the factor-change pairing when the change is old', () => {
    const history = [
      observation({ eventKey: 'password_changed', observedAt: minutesBefore(180) }),
      observation({ observedAt: minutesBefore(600) }),
    ];

    const assessment = assessRisk(history, observation({ deviceRef: 'device-unseen' }));

    expect(assessment.signals).not.toContain('new_device_with_factor_change');
    expect(assessment.level).toBe('elevated');
  });

  it('flags impossible travel between two located sign-ins', () => {
    const history = [
      observation({
        latitude: 35.68,
        longitude: 139.69,
        country: 'JP',
        observedAt: minutesBefore(30),
      }),
    ];

    const assessment = assessRisk(history, observation());

    expect(assessment.signals).toContain('impossible_travel');
    expect(assessment.level).toBe('compromise');
  });

  it('accepts the same journey when there was time to make it', () => {
    const history = [
      observation({
        latitude: 35.68,
        longitude: 139.69,
        country: 'JP',
        observedAt: minutesBefore(60 * 20),
      }),
    ];

    expect(assessRisk(history, observation()).signals).not.toContain('impossible_travel');
  });

  it('ignores short hops that a coarse edge location cannot resolve', () => {
    const history = [
      observation({ latitude: 37.34, longitude: -121.89, observedAt: minutesBefore(2) }),
    ];

    expect(assessRisk(history, observation()).signals).not.toContain('impossible_travel');
  });

  it('treats repeated failures inside the window as a compromise', () => {
    const history = Array.from({ length: 4 }, (_, index) =>
      observation({ outcome: 'failure', observedAt: minutesBefore(index + 1) }),
    );

    const assessment = assessRisk(history, observation({ outcome: 'failure' }));

    expect(assessment.signals).toContain('repeated_auth_failures');
    expect(assessment.level).toBe('compromise');
  });

  it('does not count failures older than the window', () => {
    const history = Array.from({ length: 6 }, (_, index) =>
      observation({ outcome: 'failure', observedAt: minutesBefore(20 + index) }),
    );

    expect(assessRisk(history, observation({ outcome: 'failure' })).signals).not.toContain(
      'repeated_auth_failures',
    );
  });

  it('measures distance between two known cities', () => {
    const km = distanceKm(
      { latitude: 37.77, longitude: -122.42 },
      { latitude: 40.71, longitude: -74.01 },
    );
    expect(km).toBeGreaterThan(4000);
    expect(km).toBeLessThan(4200);
  });
});

describe('observationFromRequest', () => {
  it('stores the address only as a digest and reads the edge location', () => {
    const request = new Request('https://app.example.com/api/auth/callback', {
      headers: {
        'x-real-ip': '203.0.113.7',
        'x-vercel-ip-country': 'de',
        'x-vercel-ip-latitude': '52.52',
        'x-vercel-ip-longitude': '13.40',
      },
    });

    const result = observationFromRequest({ userId: 'user-1', eventKey: 'new_sign_in', request });

    expect(result.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain('203.0.113.7');
    expect(result).toMatchObject({ country: 'DE', latitude: 52.52, longitude: 13.4 });
  });

  it('drops a location the edge did not supply', () => {
    const result = observationFromRequest({
      userId: 'user-1',
      eventKey: 'new_sign_in',
      request: new Request('https://app.example.com/api/auth/callback'),
    });

    expect(result).toMatchObject({ ipHash: null, country: null, latitude: null, longitude: null });
  });
});

describe('recordIdentityObservation', () => {
  const query = vi.fn();
  const execute = vi.fn();
  const db = { query, execute } as never;

  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    execute.mockReset().mockResolvedValue(undefined);
  });

  it('emits a new-device signal and writes the observation', async () => {
    query.mockResolvedValueOnce([
      {
        event_key: 'new_sign_in',
        outcome: 'success',
        ip_hash: 'hash:a',
        country: 'US',
        latitude: '37.77',
        longitude: '-122.42',
        device_ref: 'device-known',
        surface: 'web',
        observed_at: minutesBefore(600),
      },
    ]);

    const assessment = await recordIdentityObservation(db, {
      userId: 'user-1',
      eventKey: 'new_sign_in',
      deviceRef: 'device-unseen',
    });

    expect(assessment.signals).toContain('new_device');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.identity_risk_observations'),
      expect.arrayContaining(['user-1', 'new_sign_in', 'success', null, null]),
    );
  });

  it('still assesses when the history read fails', async () => {
    query.mockRejectedValueOnce(new Error('neon down'));

    const assessment = await recordIdentityObservation(db, {
      userId: 'user-1',
      eventKey: 'new_sign_in',
      deviceRef: 'device-unseen',
    });

    expect(assessment).toEqual({ level: 'none', signals: [] });
    expect(execute).toHaveBeenCalled();
  });
});
