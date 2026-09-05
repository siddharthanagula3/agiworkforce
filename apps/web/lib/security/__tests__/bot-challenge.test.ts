import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ checkBotId: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('botid/server', () => ({ checkBotId: mocks.checkBotId }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isAppError } from '@/lib/errors';

import {
  BOT_CHALLENGED_ENDPOINTS,
  BOT_CHALLENGE_ENFORCEMENT_ENV_VAR,
} from '../bot-challenge-routes';
import { BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES } from '../bot-protection';
import { isBotChallengeEnforced, requireHumanCaller, verifyBotChallenge } from '../bot-challenge';

const ENDPOINT = BOT_CHALLENGED_ENDPOINTS.supportAsk;

function humanVerification() {
  return { isHuman: true, isBot: false, isVerifiedBot: false, bypassed: false };
}

function botVerification(isVerifiedBot = false) {
  return { isHuman: false, isBot: true, isVerifiedBot, bypassed: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.platform);
  vi.stubEnv(BOT_CHALLENGE_ENFORCEMENT_ENV_VAR, 'true');
  mocks.checkBotId.mockResolvedValue(humanVerification());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isBotChallengeEnforced', () => {
  it('stays off until the environment opts in', () => {
    vi.stubEnv(BOT_CHALLENGE_ENFORCEMENT_ENV_VAR, '');
    expect(isBotChallengeEnforced()).toBe(false);

    vi.stubEnv(BOT_CHALLENGE_ENFORCEMENT_ENV_VAR, 'false');
    expect(isBotChallengeEnforced()).toBe(false);

    vi.stubEnv(BOT_CHALLENGE_ENFORCEMENT_ENV_VAR, ' ON ');
    expect(isBotChallengeEnforced()).toBe(true);
  });

  it('stays off wherever the platform provider is unavailable', () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.off);
    expect(isBotChallengeEnforced()).toBe(false);
  });
});

describe('verifyBotChallenge', () => {
  it('never calls the classifier while enforcement is off', async () => {
    vi.stubEnv(BOT_CHALLENGE_ENFORCEMENT_ENV_VAR, '');

    await expect(verifyBotChallenge(ENDPOINT)).resolves.toEqual({
      enforced: false,
      isBot: false,
      isVerifiedBot: false,
    });
    expect(mocks.checkBotId).not.toHaveBeenCalled();
  });

  it('never calls the classifier when the platform provider is off', async () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.off);

    await expect(verifyBotChallenge(ENDPOINT)).resolves.toEqual({
      enforced: false,
      isBot: false,
      isVerifiedBot: false,
    });
    expect(mocks.checkBotId).not.toHaveBeenCalled();
  });

  it('reports the classifier verdict when enforcement is on', async () => {
    mocks.checkBotId.mockResolvedValue(botVerification(true));

    await expect(verifyBotChallenge(ENDPOINT)).resolves.toEqual({
      enforced: true,
      isBot: true,
      isVerifiedBot: true,
    });
  });

  it('lets the request through when the classifier itself is unavailable', async () => {
    mocks.checkBotId.mockRejectedValue(new Error('bot protection unreachable'));

    await expect(verifyBotChallenge(ENDPOINT)).resolves.toEqual({
      enforced: true,
      isBot: false,
      isVerifiedBot: false,
    });
  });
});

describe('requireHumanCaller', () => {
  it('returns quietly for a human caller', async () => {
    await expect(requireHumanCaller(ENDPOINT)).resolves.toBeUndefined();
  });

  it('lets every caller through when the platform provider is off', async () => {
    vi.stubEnv(BOT_PROTECTION_ENV_VAR, BOT_PROTECTION_MODES.off);
    mocks.checkBotId.mockResolvedValue(botVerification());

    await expect(requireHumanCaller(ENDPOINT)).resolves.toBeUndefined();
  });

  it('throws a 403 app error for a detected bot', async () => {
    mocks.checkBotId.mockResolvedValue(botVerification());

    await expect(requireHumanCaller(ENDPOINT)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.statusCode === 403,
    );
  });
});
