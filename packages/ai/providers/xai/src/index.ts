/**
 * @agiworkforce/providers-xai
 *
 * xAI (Grok) provider adapter. xAI ships an OpenAI-compatible Chat Completions
 * endpoint at `https://api.x.ai/v1`, which the compat detector classifies as
 * `endpointClass: 'xai-native'` (no `service_tier`, no Responses API).
 *
 * @packageDocumentation
 */

import {
  createOpenAICompatAdapter,
  type OpenAICompatAdapterConfig,
} from '@agiworkforce/providers-openai';
import type { ProviderAdapter, ProviderAdapterFactory } from '@agiworkforce/types';

import { XAI_MODEL_CATALOG } from './catalog';

const XAI_PROVIDER_ID = 'xai';
const XAI_LABEL = 'xAI';
const XAI_API_KEY_ENV_VAR = 'XAI_API_KEY';
const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';

export type XAIAdapterConfig = OpenAICompatAdapterConfig;

export function createXAIAdapter(config: XAIAdapterConfig = {}): ProviderAdapter {
  return createOpenAICompatAdapter(
    {
      id: XAI_PROVIDER_ID,
      label: XAI_LABEL,
      apiKeyEnvVar: XAI_API_KEY_ENV_VAR,
      apiKeyLabel: 'xAI API Key',
      defaultBaseUrl: XAI_DEFAULT_BASE_URL,
      catalog: XAI_MODEL_CATALOG,
    },
    config,
  );
}

export const xaiAdapterFactory: ProviderAdapterFactory = (config) =>
  createXAIAdapter(config as XAIAdapterConfig);

export { XAI_MODEL_CATALOG } from './catalog';
