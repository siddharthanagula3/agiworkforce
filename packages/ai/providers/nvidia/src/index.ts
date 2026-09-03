import {
  createOpenAICompatAdapter,
  type OpenAICompatAdapterConfig,
} from '@agiworkforce/providers-openai';
import type { ProviderAdapter, ProviderAdapterFactory } from '@agiworkforce/types';

import { NVIDIA_MODEL_CATALOG } from './catalog';

const NVIDIA_PROVIDER_ID = 'nvidia_nim';
const NVIDIA_LABEL = 'NVIDIA NIM';
const NVIDIA_API_KEY_ENV_VAR = 'NVIDIA_NIM_API_KEY';
const NVIDIA_BASE_URL_ENV_VAR = 'NVIDIA_NIM_BASE_URL';
const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export type NvidiaAdapterConfig = OpenAICompatAdapterConfig;

export function createNvidiaAdapter(config: NvidiaAdapterConfig = {}): ProviderAdapter {
  return createOpenAICompatAdapter(
    {
      id: NVIDIA_PROVIDER_ID,
      label: NVIDIA_LABEL,
      apiKeyEnvVar: NVIDIA_API_KEY_ENV_VAR,
      apiKeyLabel: 'NVIDIA NIM API Key',
      baseUrlEnvVar: NVIDIA_BASE_URL_ENV_VAR,
      defaultBaseUrl: NVIDIA_DEFAULT_BASE_URL,
      catalog: NVIDIA_MODEL_CATALOG,
    },
    config,
  );
}

export const nvidiaAdapterFactory: ProviderAdapterFactory = (config) =>
  createNvidiaAdapter(config as NvidiaAdapterConfig);

export { NVIDIA_MODEL_CATALOG } from './catalog';
