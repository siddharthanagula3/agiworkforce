import type { Provider } from './provider';

export type ProviderPresetId =
  | 'google'
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'xai'
  | 'ollama'
  | 'lmstudio'
  | 'open_router'
  | 'groq'
  | 'mistral'
  | 'azure'
  | 'bedrock'
  | 'together'
  | 'fireworks'
  | 'huggingface'
  | 'cohere'
  | 'replicate';

export type ProviderRolloutTier =
  | 'already_supported'
  | 'first_wave_native'
  | 'openai_compatible_preset'
  | 'optional'
  | 'deprioritized';

export type ProviderConnectorKind =
  | 'direct_lab'
  | 'router'
  | 'enterprise_cloud'
  | 'openai_compatible_host'
  | 'local_runtime'
  | 'managed_cloud'
  | 'experimental_runtime';

export type ProviderTransport =
  | 'native'
  | 'openai_compatible'
  | 'openai_compatible_router'
  | 'enterprise_native'
  | 'local_openai_compatible'
  | 'local_native'
  | 'manual_only';

export type ProviderOnboardingGoal =
  | 'start_free'
  | 'best_for_coding'
  | 'fastest_responses'
  | 'enterprise_account'
  | 'local_offline'
  | 'broadest_catalog';

export interface ProviderEndpointPreset {
  /** Base URL for OpenAI SDK-compatible clients. */
  baseUrl: string;
  /** Full Chat Completions URL for lower-level HTTP clients. */
  chatCompletionsUrl: string;
  /** Preferred environment variable for BYOK setup. */
  apiKeyEnv: string;
  /** Optional model-list endpoint when the host exposes one. */
  modelsUrl?: string;
}

export interface EnterpriseSetupField {
  id: string;
  label: string;
  required: boolean;
  secret?: boolean;
}

export interface ProviderFreeStart {
  rank: number;
  label: string;
  caveats: readonly string[];
}

export interface ProviderPreset {
  id: ProviderPresetId;
  /** Canonical Provider id when this preset maps to models.json. */
  provider?: Provider;
  label: string;
  rolloutTier: ProviderRolloutTier;
  connectorKind: ProviderConnectorKind;
  transport: ProviderTransport;
  docsUrl: string;
  pricingUrl?: string;
  endpoint?: ProviderEndpointPreset;
  setupFields?: readonly EnterpriseSetupField[];
  recommendedBadges: readonly string[];
  onboardingGoals: readonly ProviderOnboardingGoal[];
  freeStart?: ProviderFreeStart;
  /** Product guidance for how all surfaces should present this connector. */
  productPositioning: string;
  /** Implementation guidance for adapters/settings screens. */
  implementationPath: string;
  privacyNotes?: readonly string[];
}

const apiKeyField = (id: string, label: string): EnterpriseSetupField => ({
  id,
  label,
  required: true,
  secret: true,
});

export const PROVIDER_PRESETS = Object.freeze({
  google: {
    id: 'google',
    provider: 'google',
    label: 'Google Gemini',
    rolloutTier: 'already_supported',
    connectorKind: 'direct_lab',
    transport: 'native',
    docsUrl: 'https://ai.google.dev/docs',
    pricingUrl: 'https://ai.google.dev/pricing',
    recommendedBadges: ['Best free default', 'Gemini', 'Multimodal'],
    onboardingGoals: ['start_free', 'best_for_coding'],
    freeStart: {
      rank: 1,
      label: 'Best broad free default',
      caveats: ['Free-tier limits vary by model and account tier.'],
    },
    productPositioning: 'Primary zero-spend onboarding route for broad chat and multimodal use.',
    implementationPath:
      'Keep as a native Google adapter and expose as the first Start free option.',
    privacyNotes: ['Free-tier data handling should be surfaced clearly in onboarding copy.'],
  },
  anthropic: {
    id: 'anthropic',
    provider: 'anthropic',
    label: 'Anthropic',
    rolloutTier: 'already_supported',
    connectorKind: 'direct_lab',
    transport: 'native',
    docsUrl: 'https://docs.anthropic.com',
    pricingUrl: 'https://www.anthropic.com/pricing',
    recommendedBadges: ['Premium coding', 'Tool use', 'Computer use'],
    onboardingGoals: ['best_for_coding'],
    productPositioning: 'Premium coding and agentic-workflow provider.',
    implementationPath:
      'Keep native Messages API adapter; use catalog routing for model selection.',
  },
  openai: {
    id: 'openai',
    provider: 'openai',
    label: 'OpenAI',
    rolloutTier: 'already_supported',
    connectorKind: 'direct_lab',
    transport: 'openai_compatible',
    docsUrl: 'https://platform.openai.com/docs',
    pricingUrl: 'https://openai.com/api/pricing',
    endpoint: {
      baseUrl: 'https://api.openai.com/v1',
      chatCompletionsUrl: 'https://api.openai.com/v1/chat/completions',
      apiKeyEnv: 'OPENAI_API_KEY',
      modelsUrl: 'https://api.openai.com/v1/models',
    },
    recommendedBadges: ['Default API standard', 'Premium coding', 'Tools'],
    onboardingGoals: ['best_for_coding'],
    productPositioning: 'Default OpenAI-compatible baseline and premium model route.',
    implementationPath:
      'Keep direct OpenAI adapter; shared OpenAI-compatible code should remain reusable.',
  },
  deepseek: {
    id: 'deepseek',
    provider: 'deepseek',
    label: 'DeepSeek',
    rolloutTier: 'already_supported',
    connectorKind: 'direct_lab',
    transport: 'openai_compatible',
    docsUrl: 'https://api-docs.deepseek.com',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    endpoint: {
      baseUrl: 'https://api.deepseek.com/v1',
      chatCompletionsUrl: 'https://api.deepseek.com/v1/chat/completions',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    recommendedBadges: ['Low cost', 'Reasoning', 'OpenAI-compatible'],
    onboardingGoals: ['best_for_coding'],
    productPositioning: 'Cost-sensitive reasoning and coding alternative.',
    implementationPath: 'Keep as direct OpenAI-compatible provider.',
  },
  xai: {
    id: 'xai',
    provider: 'xai',
    label: 'xAI',
    rolloutTier: 'already_supported',
    connectorKind: 'direct_lab',
    transport: 'openai_compatible',
    docsUrl: 'https://docs.x.ai',
    pricingUrl: 'https://x.ai/api',
    endpoint: {
      baseUrl: 'https://api.x.ai/v1',
      chatCompletionsUrl: 'https://api.x.ai/v1/chat/completions',
      apiKeyEnv: 'XAI_API_KEY',
    },
    recommendedBadges: ['Grok', 'OpenAI-compatible'],
    onboardingGoals: ['best_for_coding'],
    productPositioning: 'Grok access for users who already buy through xAI.',
    implementationPath: 'Keep direct OpenAI-compatible provider.',
  },
  ollama: {
    id: 'ollama',
    provider: 'ollama',
    label: 'Ollama',
    rolloutTier: 'already_supported',
    connectorKind: 'local_runtime',
    transport: 'local_native',
    docsUrl: 'https://github.com/ollama/ollama/tree/main/docs',
    recommendedBadges: ['Local', 'No vendor key', 'Private by default'],
    onboardingGoals: ['local_offline'],
    productPositioning: 'Default local/offline onboarding route.',
    implementationPath: 'Keep native local runtime support plus Ollama Cloud where configured.',
    privacyNotes: [
      'Local mode keeps prompts on the user machine unless tools make external calls.',
    ],
  },
  lmstudio: {
    id: 'lmstudio',
    provider: 'lmstudio',
    label: 'LM Studio',
    rolloutTier: 'already_supported',
    connectorKind: 'local_runtime',
    transport: 'local_openai_compatible',
    docsUrl: 'https://lmstudio.ai/docs',
    endpoint: {
      baseUrl: 'http://localhost:1234/v1',
      chatCompletionsUrl: 'http://localhost:1234/v1/chat/completions',
      apiKeyEnv: '',
      modelsUrl: 'http://localhost:1234/v1/models',
    },
    recommendedBadges: ['Local', 'OpenAI-compatible', 'No key'],
    onboardingGoals: ['local_offline'],
    productPositioning: 'Local OpenAI-compatible runtime for users who prefer LM Studio.',
    implementationPath: 'Keep keyless OpenAI-compatible local provider.',
    privacyNotes: [
      'Local mode keeps prompts on the user machine unless tools make external calls.',
    ],
  },
  open_router: {
    id: 'open_router',
    provider: 'open_router',
    label: 'OpenRouter',
    rolloutTier: 'first_wave_native',
    connectorKind: 'router',
    transport: 'openai_compatible_router',
    docsUrl: 'https://openrouter.ai/docs/api-reference/overview',
    pricingUrl: 'https://openrouter.ai/models',
    endpoint: {
      baseUrl: 'https://openrouter.ai/api/v1',
      chatCompletionsUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      modelsUrl: 'https://openrouter.ai/api/v1/models',
    },
    recommendedBadges: ['Broadest catalog', 'Fallback routing', 'Free models'],
    onboardingGoals: ['broadest_catalog', 'start_free', 'best_for_coding'],
    freeStart: {
      rank: 4,
      label: 'Best breadth with free models',
      caveats: [
        'Free models are rate-limited and should not be positioned as production capacity.',
      ],
    },
    productPositioning:
      'First-class router card: one key, model browser, fallback controls, and provider privacy choices.',
    implementationPath:
      'Use the OpenAI-compatible transport, but present OpenRouter as native UX instead of a custom URL.',
    privacyNotes: [
      'Expose direct-provider BYOK beside OpenRouter so users can avoid aggregator routing.',
    ],
  },
  groq: {
    id: 'groq',
    provider: 'groq',
    label: 'Groq',
    rolloutTier: 'first_wave_native',
    connectorKind: 'openai_compatible_host',
    transport: 'openai_compatible',
    docsUrl: 'https://console.groq.com/docs/openai',
    pricingUrl: 'https://groq.com/pricing',
    endpoint: {
      baseUrl: 'https://api.groq.com/openai/v1',
      chatCompletionsUrl: 'https://api.groq.com/openai/v1/chat/completions',
      apiKeyEnv: 'GROQ_API_KEY',
      modelsUrl: 'https://api.groq.com/openai/v1/models',
    },
    recommendedBadges: ['Fast free start', 'Low latency', 'Open models'],
    onboardingGoals: ['start_free', 'fastest_responses'],
    freeStart: {
      rank: 2,
      label: 'Best free and fast start',
      caveats: ['Free-plan quotas are provider-controlled and can change.'],
    },
    productPositioning: 'Speed-first provider card for fast coding/chat experiments.',
    implementationPath:
      'Use the shared OpenAI-compatible adapter with a fixed Groq preset endpoint.',
  },
  mistral: {
    id: 'mistral',
    provider: 'mistral',
    label: 'Mistral AI',
    rolloutTier: 'first_wave_native',
    connectorKind: 'direct_lab',
    transport: 'openai_compatible',
    docsUrl: 'https://docs.mistral.ai/api',
    pricingUrl: 'https://mistral.ai/products/la-plateforme',
    endpoint: {
      baseUrl: 'https://api.mistral.ai/v1',
      chatCompletionsUrl: 'https://api.mistral.ai/v1/chat/completions',
      apiKeyEnv: 'MISTRAL_API_KEY',
      modelsUrl: 'https://api.mistral.ai/v1/models',
    },
    recommendedBadges: ['Free direct-lab alternative', 'Codestral', 'OpenAI-compatible'],
    onboardingGoals: ['start_free', 'best_for_coding'],
    freeStart: {
      rank: 3,
      label: 'Best free direct-lab alternative',
      caveats: ['Experiment-plan requests may have training/data-use caveats.'],
    },
    productPositioning: 'Direct first-class Mistral/Codestral route, not a hidden custom endpoint.',
    implementationPath:
      'Use the shared OpenAI-compatible adapter with Mistral-specific catalog mapping.',
  },
  azure: {
    id: 'azure',
    provider: 'azure',
    label: 'Azure OpenAI / Foundry Models',
    rolloutTier: 'first_wave_native',
    connectorKind: 'enterprise_cloud',
    transport: 'enterprise_native',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/foundry/openai/latest',
    pricingUrl: 'https://azure.microsoft.com/pricing/details/cognitive-services/openai-service',
    setupFields: [
      { id: 'endpoint', label: 'Azure endpoint', required: true },
      { id: 'deployment', label: 'Deployment or model name', required: true },
      { id: 'apiVersion', label: 'API version', required: false },
      { id: 'authMode', label: 'Auth mode', required: true },
      apiKeyField('apiKey', 'API key'),
    ],
    recommendedBadges: ['Enterprise', 'Entra ID', 'Private deployment'],
    onboardingGoals: ['enterprise_account', 'best_for_coding'],
    productPositioning: 'Guided enterprise connector for customers who buy through Microsoft.',
    implementationPath:
      'Build a native setup wizard for endpoint, deployment, API version, and API key or Entra ID auth.',
    privacyNotes: [
      'Do not collapse Azure into generic custom URL; deployment and identity matter.',
    ],
  },
  bedrock: {
    id: 'bedrock',
    provider: 'bedrock',
    label: 'Amazon Bedrock',
    rolloutTier: 'first_wave_native',
    connectorKind: 'enterprise_cloud',
    transport: 'enterprise_native',
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html',
    pricingUrl: 'https://aws.amazon.com/bedrock/pricing',
    setupFields: [
      { id: 'region', label: 'AWS region', required: true },
      { id: 'modelId', label: 'Model ID or inference profile', required: true },
      { id: 'authMode', label: 'AWS auth mode', required: true },
      apiKeyField('accessKeyId', 'AWS access key ID'),
      apiKeyField('secretAccessKey', 'AWS secret access key'),
      { id: 'roleArn', label: 'Role ARN', required: false },
    ],
    recommendedBadges: ['Enterprise', 'AWS account', 'Many model families'],
    onboardingGoals: ['enterprise_account', 'broadest_catalog'],
    productPositioning: 'Guided enterprise connector for customers who buy and govern through AWS.',
    implementationPath:
      'Build a native wizard around AWS region, model ID/inference profile, and SigV4 or role auth.',
    privacyNotes: [
      'Bedrock setup should surface region, account, and model-provider routing clearly.',
    ],
  },
  together: {
    id: 'together',
    provider: 'together',
    label: 'Together AI',
    rolloutTier: 'openai_compatible_preset',
    connectorKind: 'openai_compatible_host',
    transport: 'openai_compatible',
    docsUrl: 'https://docs.together.ai/docs/inference/openai-compatibility',
    pricingUrl: 'https://www.together.ai/pricing',
    endpoint: {
      baseUrl: 'https://api.together.ai/v1',
      chatCompletionsUrl: 'https://api.together.ai/v1/chat/completions',
      apiKeyEnv: 'TOGETHER_API_KEY',
      modelsUrl: 'https://api.together.ai/v1/models',
    },
    recommendedBadges: ['Open models', 'Preset endpoint', 'OpenAI-compatible'],
    onboardingGoals: ['broadest_catalog', 'best_for_coding'],
    productPositioning: 'Preset connector for open-model hosting without manual base URL entry.',
    implementationPath:
      'Use the shared OpenAI-compatible adapter; do not build custom SDK code first.',
  },
  fireworks: {
    id: 'fireworks',
    provider: 'fireworks',
    label: 'Fireworks AI',
    rolloutTier: 'openai_compatible_preset',
    connectorKind: 'openai_compatible_host',
    transport: 'openai_compatible',
    docsUrl: 'https://docs.fireworks.ai/tools-sdks/openai-compatibility',
    pricingUrl: 'https://fireworks.ai/pricing',
    endpoint: {
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      chatCompletionsUrl: 'https://api.fireworks.ai/inference/v1/chat/completions',
      apiKeyEnv: 'FIREWORKS_API_KEY',
      modelsUrl: 'https://api.fireworks.ai/inference/v1/models',
    },
    recommendedBadges: ['Open models', 'Preset endpoint', 'OpenAI-compatible'],
    onboardingGoals: ['broadest_catalog', 'fastest_responses'],
    productPositioning: 'Preset connector for open-model hosting without manual base URL entry.',
    implementationPath:
      'Use the shared OpenAI-compatible adapter; do not build custom SDK code first.',
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face Inference Providers',
    rolloutTier: 'openai_compatible_preset',
    connectorKind: 'router',
    transport: 'openai_compatible_router',
    docsUrl: 'https://huggingface.co/docs/inference-providers/index',
    pricingUrl: 'https://huggingface.co/pricing',
    endpoint: {
      baseUrl: 'https://router.huggingface.co/v1',
      chatCompletionsUrl: 'https://router.huggingface.co/v1/chat/completions',
      apiKeyEnv: 'HF_TOKEN',
    },
    recommendedBadges: ['Routed providers', 'Preset endpoint', 'OpenAI-compatible chat'],
    onboardingGoals: ['broadest_catalog'],
    freeStart: {
      rank: 6,
      label: 'Useful demos, limited free monthly credits',
      caveats: [
        'Free monthly credits are small and should not be advertised as production capacity.',
      ],
    },
    productPositioning:
      'Preset connector on top of the custom OpenAI-compatible flow, not a catalog provider yet.',
    implementationPath:
      'Route through custom OpenAI-compatible settings until models.json gains Hugging Face model IDs.',
  },
  cohere: {
    id: 'cohere',
    provider: 'cohere',
    label: 'Cohere',
    rolloutTier: 'optional',
    connectorKind: 'direct_lab',
    transport: 'native',
    docsUrl: 'https://docs.cohere.com',
    pricingUrl: 'https://cohere.com/pricing',
    recommendedBadges: ['Optional', 'Enterprise retrieval', 'Trial key'],
    onboardingGoals: ['start_free', 'enterprise_account'],
    freeStart: {
      rank: 5,
      label: 'Viable free trial for prototypes',
      caveats: ['Better for retrieval-heavy and enterprise workflows than broad chat onboarding.'],
    },
    productPositioning: 'Keep visible as optional, not a first-wave default.',
    implementationPath:
      'Add after first-wave router, fast inference, and enterprise connectors land.',
  },
  replicate: {
    id: 'replicate',
    label: 'Replicate',
    rolloutTier: 'deprioritized',
    connectorKind: 'experimental_runtime',
    transport: 'manual_only',
    docsUrl: 'https://replicate.com/docs',
    pricingUrl: 'https://replicate.com/pricing',
    recommendedBadges: ['Long-tail models', 'Multimodal experiments'],
    onboardingGoals: ['broadest_catalog'],
    productPositioning:
      'Deprioritize for chat-first workflows; useful later for long-tail media models.',
    implementationPath: 'Do not build first-wave native chat support.',
  },
} satisfies Record<ProviderPresetId, ProviderPreset>);

export const PROVIDER_PRESET_IDS = Object.freeze(
  Object.keys(PROVIDER_PRESETS) as ProviderPresetId[],
);

export const PROVIDER_GOAL_LABELS: Readonly<Record<ProviderOnboardingGoal, string>> = Object.freeze(
  {
    start_free: 'Start free',
    best_for_coding: 'Best for coding',
    fastest_responses: 'Fastest responses',
    enterprise_account: 'Enterprise account',
    local_offline: 'Local/offline',
    broadest_catalog: 'Broadest catalog',
  },
);

const GOAL_PRESET_ORDER: Readonly<Record<ProviderOnboardingGoal, readonly ProviderPresetId[]>> =
  Object.freeze({
    start_free: ['google', 'groq', 'mistral', 'open_router', 'cohere'],
    best_for_coding: ['anthropic', 'openai', 'mistral', 'deepseek', 'open_router'],
    fastest_responses: ['groq', 'fireworks', 'openai'],
    enterprise_account: ['azure', 'bedrock', 'anthropic', 'openai', 'cohere'],
    local_offline: ['ollama', 'lmstudio'],
    broadest_catalog: ['open_router', 'bedrock', 'huggingface', 'together', 'fireworks'],
  });

export const CUSTOM_OPENAI_COMPATIBLE_PROVIDER_PRESET_IDS = Object.freeze([
  'groq',
  'open_router',
  'together',
  'fireworks',
  'huggingface',
  'mistral',
  'deepseek',
] satisfies readonly ProviderPresetId[]);

export const PROVIDER_STREAM_PROVIDER_PRESET_IDS = Object.freeze([
  'anthropic',
  'openai',
  'google',
  'ollama',
  'xai',
  'deepseek',
  'open_router',
  'groq',
  'mistral',
  'together',
  'fireworks',
] satisfies readonly ProviderPresetId[]);

export type ProviderStreamProviderPresetId = (typeof PROVIDER_STREAM_PROVIDER_PRESET_IDS)[number];

export interface ProviderPresetListOptions {
  includeDeprioritized?: boolean;
  rolloutTiers?: readonly ProviderRolloutTier[];
  onboardingGoal?: ProviderOnboardingGoal;
}

export function getProviderPreset(id: string): ProviderPreset | null {
  if (Object.prototype.hasOwnProperty.call(PROVIDER_PRESETS, id)) {
    return PROVIDER_PRESETS[id as ProviderPresetId];
  }
  return null;
}

export function listProviderPresets(options: ProviderPresetListOptions = {}): ProviderPreset[] {
  const { includeDeprioritized = false, rolloutTiers, onboardingGoal } = options;
  const rolloutTierSet = rolloutTiers ? new Set<ProviderRolloutTier>(rolloutTiers) : null;

  return PROVIDER_PRESET_IDS.map((id) => PROVIDER_PRESETS[id]).filter((preset) => {
    if (!includeDeprioritized && preset.rolloutTier === 'deprioritized') {
      return false;
    }
    if (rolloutTierSet && !rolloutTierSet.has(preset.rolloutTier)) {
      return false;
    }
    if (
      onboardingGoal &&
      !(preset.onboardingGoals as readonly ProviderOnboardingGoal[]).includes(onboardingGoal)
    ) {
      return false;
    }
    return true;
  });
}

export function listOpenAICompatibleProviderPresets(): ProviderPreset[] {
  return listProviderPresets().filter((preset) => Boolean(preset.endpoint));
}

export function listCustomOpenAICompatibleProviderPresets(): ProviderPreset[] {
  return CUSTOM_OPENAI_COMPATIBLE_PROVIDER_PRESET_IDS.map((id) => PROVIDER_PRESETS[id]);
}

export function listProviderStreamProviderPresets(): ProviderPreset[] {
  return PROVIDER_STREAM_PROVIDER_PRESET_IDS.map((id) => PROVIDER_PRESETS[id]);
}

export function getRecommendedProviderPresetsForGoal(
  goal: ProviderOnboardingGoal,
  options: Pick<ProviderPresetListOptions, 'includeDeprioritized'> = {},
): ProviderPreset[] {
  const allowed = new Set(
    listProviderPresets({ ...options, onboardingGoal: goal }).map((p) => p.id),
  );
  return GOAL_PRESET_ORDER[goal].filter((id) => allowed.has(id)).map((id) => PROVIDER_PRESETS[id]);
}
