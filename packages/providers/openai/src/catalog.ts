/**
 * OpenAI model catalog.
 *
 * Hardcoded list of current OpenAI models. The OpenAI API does expose
 * `/v1/models`, but it's noisy and includes deprecated/internal SKUs. This
 * curated list mirrors what AGI Workforce supports + matches `models.json`.
 *
 * Update with each OpenAI release.
 */

import type { ModelInfo } from '@agiworkforce/types';

export const OPENAI_MODEL_CATALOG: readonly ModelInfo[] = [
  // GPT-5.x family
  {
    id: 'gpt-5.4-pro',
    name: 'GPT-5.4 Pro',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutputTokens: 100_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 60.0,
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutputTokens: 64_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutputTokens: 32_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 2.0,
  },
  {
    id: 'gpt-5.4-codex',
    name: 'GPT-5.4 Codex',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutputTokens: 64_000,
    capabilities: { streaming: true, tools: true, vision: false, thinking: true, json: true },
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
  },
];
