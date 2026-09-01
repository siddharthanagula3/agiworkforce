/**
 * @agiworkforce/providers-vercel-gateway
 *
 * Vercel AI Gateway adapter. The gateway exposes an OpenAI-compatible Chat
 * Completions endpoint at `https://ai-gateway.vercel.sh/v1` and fans out to
 * upstream vendors itself, so model ids here are gateway slugs rather than any
 * single vendor's ids.
 *
 * @packageDocumentation
 */

import {
  createOpenAICompatAdapter,
  type OpenAICompatAdapterConfig,
} from '@agiworkforce/providers-openai';
import type { ProviderAdapter, ProviderAdapterFactory } from '@agiworkforce/types';

import { VERCEL_GATEWAY_MODEL_CATALOG } from './catalog';

const VERCEL_GATEWAY_PROVIDER_ID = 'vercel_gateway';
const VERCEL_GATEWAY_LABEL = 'Vercel AI Gateway';
const VERCEL_GATEWAY_API_KEY_ENV_VAR = 'VERCEL_GATEWAY_API_KEY';
const VERCEL_GATEWAY_BASE_URL_ENV_VAR = 'VERCEL_GATEWAY_BASE_URL';
const VERCEL_GATEWAY_DEFAULT_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export type VercelGatewayAdapterConfig = OpenAICompatAdapterConfig;

export function createVercelGatewayAdapter(
  config: VercelGatewayAdapterConfig = {},
): ProviderAdapter {
  return createOpenAICompatAdapter(
    {
      id: VERCEL_GATEWAY_PROVIDER_ID,
      label: VERCEL_GATEWAY_LABEL,
      apiKeyEnvVar: VERCEL_GATEWAY_API_KEY_ENV_VAR,
      apiKeyLabel: 'Vercel AI Gateway API Key',
      baseUrlEnvVar: VERCEL_GATEWAY_BASE_URL_ENV_VAR,
      defaultBaseUrl: VERCEL_GATEWAY_DEFAULT_BASE_URL,
      catalog: VERCEL_GATEWAY_MODEL_CATALOG,
    },
    config,
  );
}

export const vercelGatewayAdapterFactory: ProviderAdapterFactory = (config) =>
  createVercelGatewayAdapter(config as VercelGatewayAdapterConfig);

export { VERCEL_GATEWAY_MODEL_CATALOG } from './catalog';
