import 'server-only';

import type { IdentityFactorAge } from '@agiworkforce/identity';
import { getRequestIdentity, verifyIdentitySessionToken } from '@/lib/server/identity';
import { stepUpActionSpec, type StepUpAction, type StepUpLevel } from './actions';

const BEARER_PREFIX = 'Bearer ';
const SECONDS_PER_MINUTE = 60;

export async function readSessionFactorAge(request: Request): Promise<IdentityFactorAge | null> {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith(BEARER_PREFIX)) {
    const claims = await verifyIdentitySessionToken(
      authorization.slice(BEARER_PREFIX.length).trim(),
    );
    return claims?.factorAge ?? null;
  }
  return (await getRequestIdentity()).factorAge ?? null;
}

export function freshVerificationMinutes(
  age: IdentityFactorAge | null,
  level: StepUpLevel,
  action: StepUpAction,
): number | null {
  const windowMinutes = Math.ceil(stepUpActionSpec(action).freshnessSeconds / SECONDS_PER_MINUTE);
  const minutes = level === 'second_factor' ? age?.secondFactorMinutes : age?.firstFactorMinutes;
  return typeof minutes === 'number' && minutes < windowMinutes ? minutes : null;
}
