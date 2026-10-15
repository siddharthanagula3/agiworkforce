import 'server-only';

import type { FlagSubject } from '@/lib/feature-flags/evaluate-flags';
import { evaluateFlagsForSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { logger } from '@/lib/logger';

import { PROMPT_FLAG_PREFIX, promptVariantsFromFlags } from './prompt-flags';

export async function promptVariantsForSubject(
  subject: FlagSubject,
  nowMs: number = Date.now(),
): Promise<Record<string, number>> {
  const { variants, withheld } = promptVariantsFromFlags(
    await evaluateFlagsForSubject(subject, { keyPrefix: PROMPT_FLAG_PREFIX }, nowMs),
    { internalStaff: subject.internalStaff === true },
  );
  if (withheld.length > 0) {
    logger.warn(
      { withheld },
      '[prompt-flags] a prompt flag selected a version the release ledger does not open to this subject; serving the pinned version',
    );
  }
  return variants;
}
