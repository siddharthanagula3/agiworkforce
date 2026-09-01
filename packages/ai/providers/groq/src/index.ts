/**
 * @agiworkforce/providers-groq
 *
 * Groq provider adapter. Groq serves an OpenAI-compatible Chat Completions
 * endpoint at `https://api.groq.com/openai/v1`, which the compat layer already
 * classifies as `endpointClass: 'groq-native'` (see provider-attribution.ts),
 * so the whole adapter is the shared OpenAI-compat construction plus identity.
 *
 * @packageDocumentation
 */

import {
  createOpenAICompatAdapter,
  type OpenAICompatAdapterConfig,
} from '@agiworkforce/providers-openai';
import type { ProviderAdapter, ProviderAdapterFactory } from '@agiworkforce/types';

import { GROQ_MODEL_CATALOG } from './catalog';

const GROQ_PROVIDER_ID = 'groq';
const GROQ_LABEL = 'Groq';
const GROQ_API_KEY_ENV_VAR = 'GROQ_API_KEY';
const GROQ_BASE_URL_ENV_VAR = 'GROQ_BASE_URL';
const GROQ_DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export type GroqAdapterConfig = OpenAICompatAdapterConfig;

export function createGroqAdapter(config: GroqAdapterConfig = {}): ProviderAdapter {
  return createOpenAICompatAdapter(
    {
      id: GROQ_PROVIDER_ID,
      label: GROQ_LABEL,
      apiKeyEnvVar: GROQ_API_KEY_ENV_VAR,
      apiKeyLabel: 'Groq API Key',
      baseUrlEnvVar: GROQ_BASE_URL_ENV_VAR,
      defaultBaseUrl: GROQ_DEFAULT_BASE_URL,
      catalog: GROQ_MODEL_CATALOG,
    },
    config,
  );
}

export const groqAdapterFactory: ProviderAdapterFactory = (config) =>
  createGroqAdapter(config as GroqAdapterConfig);

export { GROQ_MODEL_CATALOG } from './catalog';
