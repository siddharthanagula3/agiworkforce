import 'server-only';

import type { IdentitySession } from '@agiworkforce/identity';

import { SESSION_STATUS_ACTIVE } from '@/lib/server/session-status';

export function assertActiveSessionPage(
  sessions: readonly IdentitySession[],
  identitySubject: string,
): void {
  if (!Array.isArray(sessions)) {
    throw new Error('Identity provider returned an invalid active session page');
  }
  const ids = new Set<string>();
  for (const session of sessions) {
    if (
      !session ||
      typeof session !== 'object' ||
      typeof session.id !== 'string' ||
      session.id.length === 0 ||
      session.id.trim() !== session.id ||
      typeof session.userId !== 'string' ||
      session.userId.length === 0 ||
      session.userId.trim() !== session.userId ||
      session.userId !== identitySubject ||
      session.status !== SESSION_STATUS_ACTIVE ||
      ids.has(session.id)
    ) {
      throw new Error('Identity provider returned an invalid active session page');
    }
    ids.add(session.id);
  }
}

