/**
 * H50 — modelRouter tests
 *
 * Tests for AutoMode tier selection, capability filtering, fallback behaviour,
 * MODEL_POOLS tier composition, and tier-aware resolveAutoModeModel routing.
 *
 * Phase 2c-1: desktop classifier now delegates to @agiworkforce/routing
 * (shared heuristic) + resolveAutoModeModel from @agiworkforce/types.
 */
import { describe, it, expect } from 'vitest';
import {
  MODEL_POOLS,
  routeMessage,
  selectModelFromPool,
  estimateComplexity,
  classifyTaskLocally,
  classifyTaskWithContext,
  getMissingCapabilities,
  canModelHandleInput,
  type AutoMode,
  type TaskType,
} from '../modelRouter';
import type { RoutingMessage } from '../modelRouter';

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
    expect(pool).toContain('gpt-5.4-mini');
    expect(pool).toContain('gemini-3.1-flash-lite');
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
    expect(pool).toContain('claude-opus-4.7');
    expect(pool).toContain('gpt-5.5');
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
    // Use a message that triggers the shared classifier's RE_REASONING_VERB or
    // RE_REASONING_MATH patterns. "Analyze pros and cons" is a short message that
    // the shared classifier (correctly) routes to simple_chat; use "prove" or math.
    const result = classifyTaskLocally('prove that sqrt(2) is irrational using contradiction');
    expect(result).not.toBeNull();
    if (result) {
      expect(result.taskType).toBe('reasoning');
    }
  });

  it('returns null for ambiguous / simple-chat messages', () => {
    // The shared classifier returns simple_chat @ 0.7 for short messages.
    // The adapter treats <= 0.7 as low-confidence and returns null, so the
    // caller can fall through to intentClassifier or LLM-based classification.
    const result = classifyTaskLocally('ok');
    expect(result).toBeNull();
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

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2c-1: Tier-aware routing via resolveAutoModeModel
// ──────────────────────────────────────────────────────────────────────────────

describe('routeMessage — tier-aware routing (Phase 2c-1)', () => {
  it('coding message + Pro tier → returns claude-sonnet-4.6 (Pro coding_premium_pro slot)', () => {
    // "Write a function" triggers RE_CODING → coding type → coding_premium_pro → claude-sonnet-4.6
    // claude-sonnet-4.6 is in the Pro pool so it wins over pool-ranked selection.
    const result = routeMessage(
      'Write a function to parse JSON with error handling',
      'auto-balanced',
      false,
      'pro',
    );
    // The Pro coding slot maps to claude-sonnet-4.6; it IS in the pro pool.
    expect(result.selectedModel).toBe('claude-sonnet-4.6');
    expect(result.taskType).toBe('coding');
  });

  it('coding message + Hobby tier → model is from economy pool', () => {
    // Hobby pool = economy tier models. The escalation_coding slot (glm-4.7) is
    // not in the economy TIER_ALLOWED_MODELS list so pool fallback applies.
    // The router should still return a valid model from the economy pool.
    const result = routeMessage(
      'Write a function to parse JSON with error handling',
      'auto-economy',
      false,
      'hobby',
    );
    const hobbyPool = MODEL_POOLS['auto-economy'];
    expect(hobbyPool).toContain(result.selectedModel);
    expect(result.taskType).toBe('coding');
  });

  it('research message + Free tier → returns gemini-3.1-flash-lite (workhorse_general slot)', () => {
    // RE_RESEARCH fires on "latest AI news 2026" → research @ 0.85 (> 0.7 threshold)
    // adapter returns ClassificationResult { taskType: 'general', confidence: 0.85 }
    // resolveAutoModeModel('auto-economy', 'free', 'research') → workhorse_general → gemini-3.1-flash-lite
    // gemini-3.1-flash-lite IS in the economy pool → canonical model selected.
    const result = routeMessage('latest AI news 2026', 'auto-economy', false, 'free');
    const economyPool = MODEL_POOLS['auto-economy'];
    expect(economyPool).toContain(result.selectedModel);
    expect(result.selectedModel).toBe('gemini-3.1-flash-lite');
  });

  it('selected model stays in the correct pool regardless of tier', () => {
    const economyResult = routeMessage('Tell me a story', 'auto-economy', false, 'free');
    const proResult = routeMessage('Tell me a story', 'auto-balanced', false, 'pro');

    expect(MODEL_POOLS['auto-economy']).toContain(economyResult.selectedModel);
    expect(MODEL_POOLS['auto-balanced']).toContain(proResult.selectedModel);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2c-1: Sticky pivot via classifyTaskWithContext
// ──────────────────────────────────────────────────────────────────────────────

describe('classifyTaskWithContext — sticky pivot (Phase 2c-1)', () => {
  it('boosts confidence for coding when conversation history is all coding', () => {
    const history: RoutingMessage[] = [
      { role: 'user', content: 'def parse_json(s): ...', taskType: 'coding' },
      { role: 'assistant', content: 'Here is the implementation', taskType: 'coding' },
      { role: 'user', content: 'class Parser:', taskType: 'coding' },
    ];

    // Message with coding signal — sticky pivot should boost confidence
    const result = classifyTaskWithContext('import os\nprint("hello")', history);
    // Must return non-null (coding signals + sticky boost keeps it above threshold)
    expect(result).not.toBeNull();
    if (result) {
      expect(result.taskType).toBe('coding');
      // Confidence should be boosted (>= shared base of 0.85)
      expect(result.confidence).toBeGreaterThan(0.7);
    }
  });

  it('returns null for low-confidence messages even with conversation context', () => {
    // 'ok' is simple_chat @ 0.7, adapter returns null for <= 0.7
    const result = classifyTaskWithContext('ok', []);
    expect(result).toBeNull();
  });
});
