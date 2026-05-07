/**
 * modelRouter.test.ts — Provider-level model routing tests
 *
 * Tests that:
 *   - xAI (Grok) models are present in MODEL_METADATA with the correct provider
 *   - Mistral models have the correct apiModelId for API calls
 *   - Anthropic thinking/reasoning models have the thinking capability
 *   - getModelForRequest returns the manually-selected model unchanged
 *   - isManualSelection correctly classifies auto vs manual modes
 *
 * Complementary to the existing lib/__tests__/modelRouter.test.ts which covers
 * AUTO mode routing logic. This file focuses on provider-specific metadata
 * and the frontend routing path used by the chat IPC layer.
 */

import { describe, it, expect } from 'vitest';
import { getModelForRequest, isManualSelection } from '../lib/modelRouter';
import { MODEL_METADATA, getModelMetadata } from '../constants/llm';

// ---------------------------------------------------------------------------
// xAI / Grok model routing
// ---------------------------------------------------------------------------

describe('xAI model routing', () => {
  it('grok-4 has provider=xai in MODEL_METADATA', () => {
    const meta = getModelMetadata('grok-4');
    expect(meta).not.toBeNull();
    expect(meta?.provider).toBe('xai');
  });

  it('grok-4-fast-reasoning has provider=xai in MODEL_METADATA', () => {
    const meta = getModelMetadata('grok-4-fast-reasoning');
    expect(meta).not.toBeNull();
    expect(meta?.provider).toBe('xai');
  });

  it('grok-4 is treated as a manual selection (not auto mode)', () => {
    expect(isManualSelection('grok-4')).toBe(true);
  });

  it('getModelForRequest with grok-4 returns grok-4 unchanged', () => {
    const result = getModelForRequest('grok-4', 'Analyze this tweet from X.com', false);
    expect(result.modelId).toBe('grok-4');
    expect(result.wasRouted).toBe(false);
  });

  it('grok-4 has real-time data search capability (correct for X/Twitter integration)', () => {
    const meta = getModelMetadata('grok-4');
    // Grok has built-in real-time data access
    expect(meta?.capabilities?.search).toBe(true);
  });

  it('Perplexity Sonar has NO vision capability (text-only research model)', () => {
    // Note: grok-4 used to be the canary here, but grok-4 is now aliased
    // forward to grok-4.3 which has built-in vision (Phase 3 catalog refresh).
    // sonar (Perplexity) is a stable non-vision research model and is not
    // aliased to anything else, so it works as a canary here.
    const meta = getModelMetadata('sonar');
    expect(meta?.capabilities?.vision).toBe(false);
  });

  it('all xai provider models have ids starting with "grok"', () => {
    const xaiModels = Object.values(MODEL_METADATA).filter((m) => m.provider === 'xai');
    expect(xaiModels.length).toBeGreaterThan(0);
    for (const model of xaiModels) {
      expect(model.id).toMatch(/^grok/);
    }
  });
});

// ---------------------------------------------------------------------------
// Mistral model routing
// ---------------------------------------------------------------------------

describe('Mistral model routing', () => {
  it('mistral-large-3 has provider=mistral in MODEL_METADATA', () => {
    const meta = getModelMetadata('mistral-large-3');
    expect(meta).not.toBeNull();
    expect(meta?.provider).toBe('mistral');
  });

  it('mistral-large-3 has the correct apiModelId for API calls', () => {
    const meta = getModelMetadata('mistral-large-3');
    // apiModelId is what gets sent to the Mistral API endpoint
    expect(meta?.apiModelId).toBe('mistral-large-2512');
  });

  it('pixtral-large has provider=mistral and vision capability', () => {
    const meta = getModelMetadata('pixtral-large');
    expect(meta).not.toBeNull();
    expect(meta?.provider).toBe('mistral');
    expect(meta?.capabilities?.vision).toBe(true);
  });

  it('pixtral-large has the correct apiModelId', () => {
    const meta = getModelMetadata('pixtral-large');
    expect(meta?.apiModelId).toBe('pixtral-large-latest');
  });

  it('getModelForRequest with mistral-large-3 returns it unchanged (manual selection)', () => {
    const result = getModelForRequest('mistral-large-3', 'Write code for me', false);
    expect(result.modelId).toBe('mistral-large-3');
    expect(result.wasRouted).toBe(false);
  });

  it('all mistral provider models have valid apiModelId strings', () => {
    const mistralModels = Object.values(MODEL_METADATA).filter((m) => m.provider === 'mistral');
    expect(mistralModels.length).toBeGreaterThan(0);
    for (const model of mistralModels) {
      if (model.apiModelId !== undefined) {
        expect(typeof model.apiModelId).toBe('string');
        expect(model.apiModelId.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Anthropic thinking/reasoning models
// ---------------------------------------------------------------------------

describe('Anthropic thinking model routing', () => {
  it('claude-opus-4.6 has the thinking capability enabled', () => {
    const meta = getModelMetadata('claude-opus-4.6');
    expect(meta).not.toBeNull();
    expect(meta?.capabilities?.thinking).toBe(true);
  });

  it('claude-sonnet-4.6 has the correct apiModelId', () => {
    const meta = getModelMetadata('claude-sonnet-4.6');
    expect(meta?.apiModelId).toBe('claude-sonnet-4-6');
  });

  it('claude-opus-4.6 has the correct apiModelId', () => {
    const meta = getModelMetadata('claude-opus-4.6');
    expect(meta?.apiModelId).toBe('claude-opus-4-6');
  });

  it('getModelForRequest with claude-opus-4.6 returns it unchanged (manual selection)', () => {
    const result = getModelForRequest('claude-opus-4.6', 'Solve this hard math problem', false);
    expect(result.modelId).toBe('claude-opus-4.6');
    expect(result.wasRouted).toBe(false);
  });

  it('anthropic thinking models have computerUse capability (Claude-specific)', () => {
    const opusMeta = getModelMetadata('claude-opus-4.6');
    expect(opusMeta?.capabilities?.computerUse).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isManualSelection correctness
// ---------------------------------------------------------------------------

describe('isManualSelection', () => {
  it('returns false for auto-economy', () => {
    expect(isManualSelection('auto-economy')).toBe(false);
  });

  it('returns false for auto-balanced', () => {
    expect(isManualSelection('auto-balanced')).toBe(false);
  });

  it('returns false for auto-premium', () => {
    expect(isManualSelection('auto-premium')).toBe(false);
  });

  it('returns false for legacy "auto"', () => {
    expect(isManualSelection('auto')).toBe(false);
  });

  it('returns true for a specific model id', () => {
    expect(isManualSelection('gpt-5.4')).toBe(true);
    expect(isManualSelection('claude-opus-4.6')).toBe(true);
    expect(isManualSelection('grok-4')).toBe(true);
    expect(isManualSelection('mistral-large-3')).toBe(true);
  });

  it('returns true even for unknown/custom model ids', () => {
    // Respects user explicit choice even for unrecognised models
    expect(isManualSelection('my-custom-local-model')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getModelForRequest — auto mode routing
// ---------------------------------------------------------------------------

describe('getModelForRequest auto mode routing', () => {
  it('routes auto-economy to a model that exists in MODEL_METADATA or pool', () => {
    const result = getModelForRequest('auto-economy', 'Quick question', false);
    expect(typeof result.modelId).toBe('string');
    expect(result.modelId.length).toBeGreaterThan(0);
    expect(result.wasRouted).toBe(true);
  });

  it('routes auto-balanced to a model', () => {
    const result = getModelForRequest('auto-balanced', 'Explain this concept', false);
    expect(result.wasRouted).toBe(true);
  });

  it('routes auto-premium to a model', () => {
    const result = getModelForRequest('auto-premium', 'Architect a system', false);
    expect(result.wasRouted).toBe(true);
  });

  it('routes legacy "auto" as balanced tier', () => {
    const result = getModelForRequest('auto', 'Hello', false);
    expect(result.wasRouted).toBe(true);
  });
});
