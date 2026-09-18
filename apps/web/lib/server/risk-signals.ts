import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/security-audit';
import { hashIpAddress } from '@/lib/server/ip-hash';

export const RISK_SIGNALS = [
  'new_device',
  'new_location',
  'impossible_travel',
  'repeated_auth_failures',
  'new_device_with_factor_change',
] as const;

export type RiskSignal = (typeof RISK_SIGNALS)[number];

export type RiskLevel = 'none' | 'elevated' | 'compromise';

export interface RiskObservation {
  eventKey: string;
  outcome: 'success' | 'failure';
  ipHash: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  deviceRef: string | null;
  surface: string | null;
  observedAt: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  signals: RiskSignal[];
}

/** Faster than any scheduled flight, so two sign-ins cannot be the same person. */
const IMPOSSIBLE_TRAVEL_KMH = 900;
/** Below this, a coarse edge location is noise rather than movement. */
const IMPOSSIBLE_TRAVEL_MIN_KM = 500;
const AUTH_FAILURE_WINDOW_MS = 15 * 60_000;
const AUTH_FAILURE_THRESHOLD = 5;
const FACTOR_CHANGE_WINDOW_MS = 60 * 60_000;
const HISTORY_LIMIT = 50;
const EARTH_RADIUS_KM = 6371;

const FACTOR_CHANGE_EVENTS: ReadonlySet<string> = new Set([
  'password_changed',
  'email_changed',
  'two_factor_enabled',
  'two_factor_disabled',
  'backup_codes_regenerated',
  'passkey_added',
  'passkey_removed',
]);

const COMPROMISE_SIGNALS: ReadonlySet<RiskSignal> = new Set<RiskSignal>([
  'impossible_travel',
  'repeated_auth_failures',
  'new_device_with_factor_change',
]);

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function millis(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasCoordinates(
  observation: Pick<RiskObservation, 'latitude' | 'longitude'>,
): observation is RiskObservation & { latitude: number; longitude: number } {
  return observation.latitude !== null && observation.longitude !== null;
}

/**
 * Pure so the thresholds can be tested without a database. History is the most
 * recent observations first; an account with no history produces no signal,
 * because a first sign-in from anywhere is not evidence of anything.
 */
export function assessRisk(
  history: readonly RiskObservation[],
  current: RiskObservation,
): RiskAssessment {
  const signals = new Set<RiskSignal>();
  const currentAt = millis(current.observedAt);
  const successes = history.filter((entry) => entry.outcome === 'success');

  const knownDevice =
    !current.deviceRef || successes.some((entry) => entry.deviceRef === current.deviceRef);
  const isNewDevice = successes.length > 0 && !knownDevice;
  if (isNewDevice) signals.add('new_device');

  if (
    current.country &&
    successes.length > 0 &&
    successes.every((entry) => entry.country !== current.country)
  ) {
    signals.add('new_location');
  }

  const lastLocated = successes.find(hasCoordinates);
  if (lastLocated && hasCoordinates(current)) {
    const elapsedHours = Math.max(0, currentAt - millis(lastLocated.observedAt)) / 3_600_000;
    const km = distanceKm(lastLocated, current);
    // A zero elapsed time with real distance is impossible by definition, and
    // dividing by it would produce Infinity rather than a comparison.
    if (
      km >= IMPOSSIBLE_TRAVEL_MIN_KM &&
      (elapsedHours === 0 || km / elapsedHours > IMPOSSIBLE_TRAVEL_KMH)
    ) {
      signals.add('impossible_travel');
    }
  }

  const recentFailures = history.filter(
    (entry) =>
      entry.outcome === 'failure' && currentAt - millis(entry.observedAt) <= AUTH_FAILURE_WINDOW_MS,
  ).length;
  const failuresIncludingCurrent = recentFailures + (current.outcome === 'failure' ? 1 : 0);
  if (failuresIncludingCurrent >= AUTH_FAILURE_THRESHOLD) signals.add('repeated_auth_failures');

  if (
    isNewDevice &&
    history.some(
      (entry) =>
        FACTOR_CHANGE_EVENTS.has(entry.eventKey) &&
        currentAt - millis(entry.observedAt) <= FACTOR_CHANGE_WINDOW_MS,
    )
  ) {
    signals.add('new_device_with_factor_change');
  }

  const ordered = RISK_SIGNALS.filter((signal) => signals.has(signal));
  const level: RiskLevel = ordered.some((signal) => COMPROMISE_SIGNALS.has(signal))
    ? 'compromise'
    : ordered.length > 0
      ? 'elevated'
      : 'none';
  return { level, signals: ordered };
}

interface ObservationRow {
  event_key: string;
  outcome: string;
  ip_hash: string | null;
  country: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  device_ref: string | null;
  surface: string | null;
  observed_at: string | Date;
}

function toObservation(row: ObservationRow): RiskObservation {
  const latitude = row.latitude === null ? null : Number(row.latitude);
  const longitude = row.longitude === null ? null : Number(row.longitude);
  return {
    eventKey: row.event_key,
    outcome: row.outcome === 'failure' ? 'failure' : 'success',
    ipHash: row.ip_hash,
    country: row.country,
    latitude: latitude !== null && Number.isFinite(latitude) ? latitude : null,
    longitude: longitude !== null && Number.isFinite(longitude) ? longitude : null,
    deviceRef: row.device_ref,
    surface: row.surface,
    observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : row.observed_at,
  };
}

export async function readRecentObservations(
  db: DatabaseAdapter,
  userId: string,
  limit = HISTORY_LIMIT,
): Promise<RiskObservation[]> {
  const rows = await db.query<ObservationRow>(
    `select event_key, outcome, ip_hash, country, latitude, longitude, device_ref, surface, observed_at
       from public.identity_risk_observations
      where user_id = $1
      order by observed_at desc
      limit $2`,
    [userId, Math.max(1, Math.min(HISTORY_LIMIT, limit))],
  );
  return rows.map(toObservation);
}

export interface ObservationInput {
  userId: string;
  eventKey: string;
  outcome?: 'success' | 'failure';
  request?: Request;
  deviceRef?: string | null;
  surface?: string | null;
  observedAt?: string;
}

const COUNTRY_HEADER = 'x-vercel-ip-country';
const LATITUDE_HEADER = 'x-vercel-ip-latitude';
const LONGITUDE_HEADER = 'x-vercel-ip-longitude';
const IP_HASH_DOMAIN = 'identity-risk';

function coordinate(value: string | null, bound: number): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= bound ? parsed : null;
}

export function observationFromRequest(input: ObservationInput): RiskObservation {
  const request = input.request;
  const ip = request ? getClientIp(request) : undefined;
  const country = request?.headers.get(COUNTRY_HEADER)?.trim().toUpperCase() ?? null;
  return {
    eventKey: input.eventKey,
    outcome: input.outcome ?? 'success',
    ipHash: ip ? hashIpAddress(ip, IP_HASH_DOMAIN) : null,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    latitude: coordinate(request?.headers.get(LATITUDE_HEADER) ?? null, 90),
    longitude: coordinate(request?.headers.get(LONGITUDE_HEADER) ?? null, 180),
    deviceRef: input.deviceRef?.trim() || null,
    surface: input.surface?.trim() || null,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

/**
 * Assesses before writing, so the new observation is never part of its own
 * history. A write failure never blocks the sign-in it describes.
 */
export async function recordIdentityObservation(
  db: DatabaseAdapter,
  input: ObservationInput,
): Promise<RiskAssessment> {
  const current = observationFromRequest(input);
  let history: RiskObservation[] = [];
  try {
    history = await readRecentObservations(db, input.userId);
  } catch (error) {
    logger.warn({ error, userId: input.userId }, '[risk-signals] history unavailable');
  }

  const assessment = assessRisk(history, current);

  try {
    await db.execute(
      `insert into public.identity_risk_observations
         (user_id, event_key, outcome, ip_hash, country, latitude, longitude, device_ref, surface, observed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.userId,
        current.eventKey,
        current.outcome,
        current.ipHash,
        current.country,
        current.latitude,
        current.longitude,
        current.deviceRef,
        current.surface,
        current.observedAt,
      ],
    );
  } catch (error) {
    logger.warn(
      { error, userId: input.userId },
      '[risk-signals] observation could not be recorded',
    );
  }

  return assessment;
}
