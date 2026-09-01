/**
 * @agiworkforce/providers-workers-ai
 *
 * Cloudflare Workers AI adapter, reached through the AI Gateway
 * OpenAI-compatible endpoint:
 * `https://gateway.ai.cloudflare.com/v1/{accountId}/{gateway}/workers-ai/v1`.
 *
 * The account and gateway segments make the endpoint account-scoped, so this
 * adapter declares no default base URL: the operator must supply one. Workers
 * AI itself is the capacity source; the gateway in front of it only adds
 * analytics and caching.
 *
 * @packageDocumentation
 */

import {
  createOpenAICompatAdapter,
  type OpenAICompatAdapterConfig,
} from '@agiworkforce/providers-openai';
import type { ProviderAdapter, ProviderAdapterFactory } from '@agiworkforce/types';

import { WORKERS_AI_MODEL_CATALOG } from './catalog';

const WORKERS_AI_PROVIDER_ID = 'workers_ai';
const WORKERS_AI_LABEL = 'Cloudflare Workers AI';
const WORKERS_AI_API_KEY_ENV_VAR = 'WORKERS_AI_API_KEY';
const WORKERS_AI_BASE_URL_ENV_VAR = 'WORKERS_AI_BASE_URL';

export type WorkersAiAdapterConfig = OpenAICompatAdapterConfig;

export function createWorkersAiAdapter(config: WorkersAiAdapterConfig = {}): ProviderAdapter {
  return createOpenAICompatAdapter(
    {
      id: WORKERS_AI_PROVIDER_ID,
      label: WORKERS_AI_LABEL,
      apiKeyEnvVar: WORKERS_AI_API_KEY_ENV_VAR,
      apiKeyLabel: 'Cloudflare Workers AI API Token',
      baseUrlEnvVar: WORKERS_AI_BASE_URL_ENV_VAR,
      catalog: WORKERS_AI_MODEL_CATALOG,
    },
    config,
  );
}

export const workersAiAdapterFactory: ProviderAdapterFactory = (config) =>
  createWorkersAiAdapter(config as WorkersAiAdapterConfig);

export { WORKERS_AI_MODEL_CATALOG } from './catalog';
