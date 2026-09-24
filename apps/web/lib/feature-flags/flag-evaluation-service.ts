import 'server-only';

import { CLIENT_VERSION_HEADER, ME_CLIENT_VERSION_PARAM } from '@agiworkforce/cloud-contracts';

import {
  PLATFORM_ADMIN_ENV_VAR,
  isPlatformAdmin,
} from '@/features/admin/lib/platform-admin-access';
import { managedCloudDataRegion } from '@/lib/server/data-region';

import { evaluateFlags, type FlagEvaluation, type FlagSubject } from './evaluate-flags';
import { getActiveFlagDefinitions, getSubjectOverrides } from './flag-store';

const COUNTRY_HEADER = 'x-vercel-ip-country';
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const CLIENT_VERSION_PATTERN = /^\d{1,6}(\.\d{1,6}){0,2}/;

export interface FlagSubjectFacts {
  userId: string;
  workspaceId: string | null;
  role: string | null;
  plan: string | null;
  surface: string | null;
}

function headerCountry(request: Request): string | null {
  const country = request.headers.get(COUNTRY_HEADER)?.trim().toUpperCase() ?? '';
  return COUNTRY_PATTERN.test(country) ? country : null;
}

export function normalizeClientVersion(raw: string): string | null {
  return CLIENT_VERSION_PATTERN.exec(raw.trim())?.[0] ?? null;
}

function requestClientVersion(request: Request): string | null {
  return normalizeClientVersion(
    request.headers.get(CLIENT_VERSION_HEADER) ??
      new URL(request.url).searchParams.get(ME_CLIENT_VERSION_PARAM) ??
      '',
  );
}

export function buildFlagSubject(request: Request, facts: FlagSubjectFacts): FlagSubject {
  return {
    ...facts,
    region: managedCloudDataRegion(),
    country: headerCountry(request),
    clientVersion: requestClientVersion(request),
    internalStaff: isPlatformAdmin(facts.userId, process.env[PLATFORM_ADMIN_ENV_VAR]),
  };
}

export async function evaluateFlagsForSubject(
  subject: FlagSubject,
  options: { keyPrefix?: string; keyPrefixes?: readonly string[] } = {},
  nowMs: number = Date.now(),
): Promise<Record<string, FlagEvaluation>> {
  const prefixes = [
    ...(options.keyPrefix === undefined ? [] : [options.keyPrefix]),
    ...(options.keyPrefixes ?? []),
  ];
  const definitions = (await getActiveFlagDefinitions(nowMs)).filter(
    (definition) =>
      prefixes.length === 0 ||
      prefixes.some((prefix) => definition.key === prefix || definition.key.startsWith(prefix)),
  );
  if (definitions.length === 0) return {};
  const overrides = await getSubjectOverrides(
    subject.userId,
    subject.workspaceId,
    definitions.map((definition) => definition.key),
  );
  return evaluateFlags(definitions, subject, overrides, nowMs);
}
