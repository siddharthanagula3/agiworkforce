export const BOT_CHALLENGE_ENFORCEMENT_ENV_VAR = 'AGI_BOT_CHALLENGE_ENFORCED';

export interface BotChallengedEndpoint {
  path: string;
  method: string;
}

export const BOT_CHALLENGED_ENDPOINTS = {
  supportAsk: { path: '/api/support/ask', method: 'POST' },
  supportHandoffCreate: { path: '/api/support/handoff', method: 'POST' },
  supportHandoffMessage: { path: '/api/support/handoff/*/messages', method: 'POST' },
} as const satisfies Record<string, BotChallengedEndpoint>;

export const BOT_CHALLENGED_ROUTES: BotChallengedEndpoint[] =
  Object.values(BOT_CHALLENGED_ENDPOINTS);
