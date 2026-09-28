import 'server-only';

import {
  buildFlagSubject,
  evaluateFlagsForSubject,
} from '@/lib/feature-flags/flag-evaluation-service';
import { logger } from '@/lib/logger';
import { isBotChallengeEnforced } from '@/lib/security/bot-challenge';
import { isPlatformHosted } from '@/lib/server/hosting';

import { GUEST_CHAT_FLAG_KEY } from './config';

const GUEST_SURFACE = 'web';

function botProtectionReady(): boolean {
  return isBotChallengeEnforced() || !isPlatformHosted(process.env);
}

export async function isGuestChatAvailable(request: Request, visitorId: string): Promise<boolean> {
  if (!botProtectionReady()) return false;
  try {
    const evaluations = await evaluateFlagsForSubject(
      buildFlagSubject(request, {
        userId: visitorId,
        workspaceId: null,
        role: null,
        plan: null,
        surface: GUEST_SURFACE,
      }),
      { keyPrefix: GUEST_CHAT_FLAG_KEY },
    );
    return evaluations[GUEST_CHAT_FLAG_KEY]?.enabled === true;
  } catch (error) {
    logger.warn({ error }, '[guest-chat] the switch could not be read, so guest chat stays off');
    return false;
  }
}
