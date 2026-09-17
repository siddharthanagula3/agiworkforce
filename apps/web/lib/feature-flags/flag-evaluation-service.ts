import 'server-only';

import { CLIENT_VERSION_HEADER, ME_CLIENT_VERSION_PARAM } from '@agiworkforce/cloud-contracts';

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

function requestClientVersion(request: Request): string | null {
  const raw =
    request.headers.get(CLIENT_VERSION_HEADER) ??
    new URL(request.url).searchParams.get(ME_CLIENT_VERSION_PARAM) ??
    '';
  return CLIENT_VERSION_PATTERN.exec(raw.trim())?.[0] ?? null;
}

export function buildFlagSubject(request: Request, facts: FlagSubjectFacts): FlagSubject {
  return {
    ...facts,
    region: managedCloudDataRegion(),
    country: headerCountry(request),
    clientVersion: requestClientVersion(request),
  };
}

export async function evaluateFlagsForSubject(
  subject: FlagSubject,
  options: { keyPrefix?: string } = {},
  nowMs: number = Date.now(),
): Promise<Record<string, FlagEvaluation>> {
  const definitions = (await getActiveFlagDefinitions(nowMs)).filter(
    (definition) => !options.keyPrefix || definition.key.startsWith(options.keyPrefix),
  );
  if (definitions.length === 0) return {};
  const overrides = await getSubjectOverrides(
    subject.userId,
    subject.workspaceId,
    definitions.map((definition) => definition.key),
  );
  return evaluateFlags(definitions, subject, overrides, nowMs);
}
