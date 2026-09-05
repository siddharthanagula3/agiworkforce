import 'server-only';

import { checkBotId } from 'botid/server';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isPlatformHosted } from '@/lib/server/hosting';
import { getOptionalEnv } from '@shared/utils/env';

import {
  BOT_CHALLENGE_ENFORCEMENT_ENV_VAR,
  type BotChallengedEndpoint,
} from './bot-challenge-routes';
import { BOT_PROTECTION_MODES, resolveBotProtectionMode } from './bot-protection';

const ENFORCEMENT_TRUTHY_VALUES = new Set(['1', 'true', 'on', 'yes']);

export interface BotChallengeVerdict {
  enforced: boolean;
  isBot: boolean;
  isVerifiedBot: boolean;
}

const PASSING_VERDICT: BotChallengeVerdict = {
  enforced: false,
  isBot: false,
  isVerifiedBot: false,
};

export function isPlatformBotProtectionAvailable(): boolean {
  return (
    resolveBotProtectionMode(process.env, isPlatformHosted(process.env)) ===
    BOT_PROTECTION_MODES.platform
  );
}

export function isBotChallengeEnforced(): boolean {
  if (!isPlatformBotProtectionAvailable()) return false;
  const raw = getOptionalEnv(BOT_CHALLENGE_ENFORCEMENT_ENV_VAR);
  return raw !== undefined && ENFORCEMENT_TRUTHY_VALUES.has(raw.trim().toLowerCase());
}

export async function verifyBotChallenge(
  endpoint: BotChallengedEndpoint,
): Promise<BotChallengeVerdict> {
  if (!isBotChallengeEnforced()) return PASSING_VERDICT;

  try {
    const verification = await checkBotId();
    return {
      enforced: true,
      isBot: verification.isBot,
      isVerifiedBot: verification.isVerifiedBot,
    };
  } catch (error) {
    logger.warn(
      { error, path: endpoint.path, method: endpoint.method },
      'Bot challenge verification was unavailable',
    );
    return { ...PASSING_VERDICT, enforced: true };
  }
}

export async function requireHumanCaller(endpoint: BotChallengedEndpoint): Promise<void> {
  const verdict = await verifyBotChallenge(endpoint);
  if (!verdict.isBot) return;

  logger.warn(
    { path: endpoint.path, method: endpoint.method, isVerifiedBot: verdict.isVerifiedBot },
    'Bot challenge rejected a public endpoint request',
  );
  throw createError.forbidden();
}
