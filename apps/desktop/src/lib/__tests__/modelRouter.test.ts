/**
 * H50 — modelRouter tests
 *
 * Tests for AutoMode tier selection, capability filtering, fallback behaviour,
 * and MODEL_POOLS tier composition.
 */
import { describe, it, expect } from 'vitest';
import {
  MODEL_POOLS,
  routeMessage,
  selectModelFromPool,
  estimateComplexity,
  classifyTaskLocally,
  getMissingCapabilities,
  canModelHandleInput,
  type AutoMode,
  type TaskType,
} from '../modelRouter';

// ──────────────────────────────────────────────────────────────────────────────
// MODEL_POOLS structure
// ──────────────────────────────────────────────────────────────────────────────

describe('MODEL_POOLS', () => {
  it('defines exactly three auto-mode tiers', () => {
    const tiers = Object.keys(MODEL_POOLS) as AutoMode[];
    expect(tiers).toContain('auto-economy');
    expect(tiers).toContain('auto-balanced');
    expect(tiers).toContain('auto-premium');
    expect(tiers).toHaveLength(3);
  });

  it('auto-economy pool is non-empty and contains budget models', () => {
    const pool = MODEL_POOLS['auto-economy'];
    expect(pool.length).toBeGreaterThan(0);
    // Canonical cheap models known to be in economy tier
    expect(pool).toContain('deepseek-chat');
    expect(pool).toContain('qwen-flash');
  });

  it('auto-balanced pool is a superset of economy pool (all economy models present)', () => {
    const economy = MODEL_POOLS['auto-economy'];
    const balanced = MODEL_POOLS['auto-balanced'];
    for (const model of economy) {
      expect(balanced).toContain(model);
    }
  });

  it('auto-premium pool is the largest tier', () => {
    const economy = MODEL_POOLS['auto-economy'];
    const balanced = MODEL_POOLS['auto-balanced'];
    const premium = MODEL_POOLS['auto-premium'];
    expect(premium.length).toBeGreaterThanOrEqual(balanced.length);
    expect(premium.length).toBeGreaterThanOrEqual(economy.length);
  });

  it('auto-premium pool includes flagship models', () => {
    const pool = MODEL_POOLS['auto-premium'];
    // Premium tier should include the top-tier Claude Opus and GPT-5 class models
    expect(pool).toContain('claude-opus-4.6');
    expect(pool).toContain('gpt-5.2');
  });

  it('all models in each pool are strings', () => {
    for (const tier of ['auto-economy', 'auto-balanced', 'auto-premium'] as AutoMode[]) {
      for (const modelId of MODEL_POOLS[tier]) {
        expect(typeof modelId).toBe('string');
        expect(modelId.length).toBeGreaterThan(0);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// routeMessage
// ──────────────────────────────────────────────────────────────────────────────

describe('routeMessage', () => {
  it('returns a selectedModel string for economy mode', () => {
    const result = routeMessage('Help me write some code', 'auto-economy');
    expect(typeof result.selectedModel).toBe('string');
    expect(result.selectedModel.length).toBeGreaterThan(0);
  });

  it('returns a selectedModel string for balanced mode', () => {
    const result = routeMessage('Explain quantum entanglement', 'auto-balanced');
    expect(typeof result.selectedModel).toBe('string');
    expect(result.selectedModel.length).toBeGreaterThan(0);
  });

  it('returns a selectedModel string for premium mode', () => {
    const result = routeMessage('Architect a microservices distributed system', 'auto-premium');
    expect(typeof result.selectedModel).toBe('string');
    expect(result.selectedModel.length).toBeGreaterThan(0);
  });

  it('routes to multimodal task when hasImages is true', () => {
    const result = routeMessage('What is in this image?', 'auto-economy', true);
    expect(result.taskType).toBe('multimodal');
    expect(result.reason).toMatch(/image detected/i);
  });

  it('selected model from premium pool is in the premium pool', () => {
    const result = routeMessage('Write a comprehensive essay', 'auto-premium');
    const pool = MODEL_POOLS['auto-premium'];
    expect(pool).toContain(result.selectedModel);
  });

  it('selected model from economy pool is in the economy pool', () => {
    const result = routeMessage('Quick summary please', 'auto-economy');
    const pool = MODEL_POOLS['auto-economy'];
    expect(pool).toContain(result.selectedModel);
  });

  it('returns a confidence value between 0 and 1', () => {
    const result = routeMessage('What is 2 + 2?', 'auto-balanced');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('includes a human-readable reason string', () => {
    const result = routeMessage('Write unit tests for my API', 'auto-balanced');
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// estimateComplexity
// ──────────────────────────────────────────────────────────────────────────────

describe('estimateComplexity', () => {
  it('classifies a short simple message as simple', () => {
    const complexity = estimateComplexity('Hello, how are you?');
    expect(complexity).toBe('simple');
  });

  it('classifies a message with "step-by-step" as complex or moderate', () => {
    const complexity = estimateComplexity('Explain step-by-step how to set up a CI/CD pipeline');
    expect(['moderate', 'complex']).toContain(complexity);
  });

  it('classifies a message with code blocks as at least moderate', () => {
    const complexity = estimateComplexity('Review this:\n```typescript\nconst x = 1;\n```');
    expect(['moderate', 'complex']).toContain(complexity);
  });

  it('classifies a very long message (200+ words) as at least moderate', () => {
    const long = 'word '.repeat(210);
    const complexity = estimateComplexity(long);
    expect(['moderate', 'complex']).toContain(complexity);
  });

  it('classifies message with attachments as at least moderate', () => {
    const complexity = estimateComplexity('Summarize this', true);
    expect(['moderate', 'complex']).toContain(complexity);
  });

  it('returns one of the three valid complexity levels', () => {
    const validLevels = ['simple', 'moderate', 'complex'];
    const result = estimateComplexity('Some random text here');
    expect(validLevels).toContain(result);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// classifyTaskLocally
// ──────────────────────────────────────────────────────────────────────────────

describe('classifyTaskLocally', () => {
  it('returns a result for a clear coding message', () => {
    const result = classifyTaskLocally('Write a Python function to parse JSON');
    expect(result).not.toBeNull();
    if (result) {
      expect(result.taskType).toBe('coding');
      expect(result.confidence).toBeGreaterThan(0);
    }
  });

  it('returns a result for a clear reasoning message', () => {
    const result = classifyTaskLocally('Analyze the pros and cons of this approach');
    expect(result).not.toBeNull();
    if (result) {
      expect(result.taskType).toBe('reasoning');
    }
  });

  it('returns null or low-confidence for ambiguous messages', () => {
    const result = classifyTaskLocally('ok');
    // Either null or very low confidence
    if (result !== null) {
      expect(result.confidence).toBeLessThan(0.7);
    }
  });

  it('confidence is between 0 and 1 when result is non-null', () => {
    const result = classifyTaskLocally('debug this javascript code');
    if (result !== null) {
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('taskType is a valid TaskType when result is non-null', () => {
    const validTypes: TaskType[] = ['coding', 'reasoning', 'general', 'agentic', 'multimodal'];
    const result = classifyTaskLocally('automate this workflow with a browser');
    if (result !== null) {
      expect(validTypes).toContain(result.taskType);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability filtering
// ──────────────────────────────────────────────────────────────────────────────

describe('canModelHandleInput', () => {
  it('returns false for unknown model', () => {
    expect(canModelHandleInput('non-existent-model-xyz', 'image')).toBe(false);
  });

  it('returns true for auto-* modes (router handles it)', () => {
    expect(canModelHandleInput('auto-economy', 'image')).toBe(true);
    expect(canModelHandleInput('auto-balanced', 'file')).toBe(true);
    expect(canModelHandleInput('auto-premium', 'image')).toBe(true);
  });

  it('returns false for image when model has no vision capability', () => {
    // deepseek-chat has no vision per the router documentation
    const result = canModelHandleInput('deepseek-chat', 'image');
    expect(result).toBe(false);
  });
});

describe('getMissingCapabilities', () => {
  it('returns an array (possibly empty) for a known model', () => {
    const result = getMissingCapabilities('claude-haiku-4.5', 'coding');
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns an array for an unknown model', () => {
    const result = getMissingCapabilities('totally-made-up-model', 'reasoning');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// selectModelFromPool — fallback when no model meets criteria
// ──────────────────────────────────────────────────────────────────────────────

describe('selectModelFromPool', () => {
  it('returns a modelId and reason for a valid pool', () => {
    const pool = MODEL_POOLS['auto-economy'];
    const result = selectModelFromPool(pool, 'general', 'auto-economy', 'Hello');
    expect(typeof result.modelId).toBe('string');
    expect(result.modelId.length).toBeGreaterThan(0);
    expect(typeof result.reason).toBe('string');
  });

  it('falls back gracefully when pool only has unrecognized models', () => {
    // Pool with one entry that does not exist in MODEL_METADATA
    const pool = ['some-unknown-model-xyz'];
    const result = selectModelFromPool(pool, 'coding', 'auto-economy', 'Write code');
    // Should still return something rather than throw
    expect(typeof result.modelId).toBe('string');
    expect(result.modelId.length).toBeGreaterThan(0);
  });

  it('returns selected model within the provided pool for premium mode', () => {
    const pool = MODEL_POOLS['auto-premium'];
    const result = selectModelFromPool(pool, 'coding', 'auto-premium');
    expect(pool).toContain(result.modelId);
  });
});
