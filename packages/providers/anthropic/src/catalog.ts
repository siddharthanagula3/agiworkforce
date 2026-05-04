/**
 * Anthropic model catalog.
 *
 * Hardcoded list of current Claude models. The Anthropic API doesn't expose a
 * `/v1/models` discovery endpoint, so the canonical source is this file plus
 * `packages/types/src/models.json`. Update both when Anthropic ships a new
 * Claude generation.
 */

import type { ModelInfo } from '@agiworkforce/types';

export const ANTHROPIC_MODEL_CATALOG: readonly ModelInfo[] = [
  {
    id: 'claude-opus-4.6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 75.0,
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    capabilities: { streaming: true, tools: true, vision: true, thinking: true, json: true },
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
  },
  {
    id: 'claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    capabilities: { streaming: true, tools: true, vision: true, thinking: false, json: true },
    inputCostPerMillion: 1.0,
    outputCostPerMillion: 5.0,
  },
];
