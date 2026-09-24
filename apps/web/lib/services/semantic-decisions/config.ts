import 'server-only';

import { ALLOWED_DECISION_TRANSPORT_HOSTS, validateBaseUrl } from '@agiworkforce/provider-runtime';

import { logger } from '@/lib/logger';

// No default endpoint, model or price: a default would dial a vendor nobody
// chose. An unusable value reads as unconfigured, and nothing here throws.
export interface DecisionTransportConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  inputMicrousdPerMtok: number;
}

export type DecisionTransportState =
  | { configured: true; config: DecisionTransportConfig }
  | { configured: false; reason: 'unset' | 'invalid_base_url' | 'invalid_price' };

const MICROUSD_PER_MTOK_MAX = 1_000_000_000;

function trimmed(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? '').trim();
}

export function readDecisionTransportConfig(
  env: NodeJS.ProcessEnv = process.env,
): DecisionTransportState {
  const apiKey = trimmed(env, 'TYPESAFE_API_KEY');
  const rawBaseUrl = trimmed(env, 'TYPESAFE_BASE_URL');
  const model = trimmed(env, 'TYPESAFE_MODEL');
  const rawPrice = trimmed(env, 'TYPESAFE_INPUT_MICROUSD_PER_MTOK');
  if (!apiKey || !rawBaseUrl || !model || !rawPrice) return { configured: false, reason: 'unset' };

  const validated = validateBaseUrl(rawBaseUrl, {
    allowedHosts: ALLOWED_DECISION_TRANSPORT_HOSTS,
  });
  if (!validated.ok) {
    // Never log the value: operator configuration can carry a credential in a
    // userinfo segment.
    logger.error(
      { reason: validated.reason, hostname: validated.hostname },
      '[semantic-decisions] configured base URL is not an admitted decision host',
    );
    return { configured: false, reason: 'invalid_base_url' };
  }

  const inputMicrousdPerMtok = Number(rawPrice);
  if (
    !Number.isFinite(inputMicrousdPerMtok) ||
    inputMicrousdPerMtok < 0 ||
    inputMicrousdPerMtok > MICROUSD_PER_MTOK_MAX
  ) {
    logger.error('[semantic-decisions] configured input price is not a usable rate');
    return { configured: false, reason: 'invalid_price' };
  }

  return {
    configured: true,
    config: { apiKey, baseUrl: validated.url, model, inputMicrousdPerMtok },
  };
}

const MICROUSD_PER_CENT = 10_000;
const TOKENS_PER_MTOK = 1_000_000;

// Rounded up to the cent the ledger column holds, so a run of sub-cent calls
// is never recorded as free.
export function decisionCost(
  inputTokens: number,
  config: DecisionTransportConfig,
): { microusd: number; cents: number } {
  const tokens = Number.isFinite(inputTokens) && inputTokens > 0 ? Math.round(inputTokens) : 0;
  const microusd = Math.round((tokens * config.inputMicrousdPerMtok) / TOKENS_PER_MTOK);
  return { microusd, cents: Math.ceil(microusd / MICROUSD_PER_CENT) };
}
