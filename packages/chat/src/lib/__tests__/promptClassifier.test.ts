import { describe, it, expect } from 'vitest';
import { classifyPrompt, buildRoutingDecision } from '../promptClassifier';

describe('classifyPrompt', () => {
  // -------------------------------------------------------------------------
  // Computer use
  // -------------------------------------------------------------------------
  it('detects computer use — click keyword', () => {
    const r = classifyPrompt('click on the submit button');
    expect(r.task).toBe('computer_use');
    expect(r.slot).toBe('computer_use');
  });

  it('detects computer use — automation keyword', () => {
    const r = classifyPrompt('automate filling out the login form');
    expect(r.task).toBe('computer_use');
  });

  it('computer use routes to computer_use_premium on premium tier', () => {
    const r = classifyPrompt('click on the submit button and fill out the form', {
      autoModeId: 'auto-premium',
    });
    expect(r.task).toBe('computer_use');
    expect(r.slot).toBe('computer_use_premium');
  });

  // -------------------------------------------------------------------------
  // Image generation
  // -------------------------------------------------------------------------
  it('detects image generation — generate image', () => {
    const r = classifyPrompt('generate an image of a sunset over mountains');
    expect(r.task).toBe('image_generation');
    expect(r.slot).toBe('image_generation');
  });

  it('detects image generation — draw keyword', () => {
    const r = classifyPrompt('draw me a cartoon cat');
    expect(r.task).toBe('image_generation');
  });

  it('detects image generation — DALL-E reference', () => {
    const r = classifyPrompt('use DALL-E to make a picture of a robot');
    expect(r.task).toBe('image_generation');
  });

  // -------------------------------------------------------------------------
  // Video generation
  // -------------------------------------------------------------------------
  it('detects video generation', () => {
    const r = classifyPrompt('generate a video of a flying eagle');
    expect(r.task).toBe('video_generation');
    expect(r.slot).toBe('video_generation');
  });

  it('detects video generation — animate keyword', () => {
    const r = classifyPrompt('animate this character running');
    expect(r.task).toBe('video_generation');
  });

  // -------------------------------------------------------------------------
  // Deep research
  // -------------------------------------------------------------------------
  it('detects deep research', () => {
    const r = classifyPrompt('write a comprehensive analysis of the EV market with citations');
    expect(r.task).toBe('deep_research');
  });

  it('deep research routes to search_premium on balanced tier', () => {
    const r = classifyPrompt('deep dive into quantum computing trends', {
      autoModeId: 'auto-balanced',
    });
    expect(r.task).toBe('deep_research');
    expect(r.slot).toBe('search_premium');
  });

  it('deep research routes to search_fast on economy tier', () => {
    const r = classifyPrompt('deep dive into quantum computing trends', {
      autoModeId: 'auto-economy',
    });
    expect(r.slot).toBe('search_fast');
  });

  // -------------------------------------------------------------------------
  // Web search
  // -------------------------------------------------------------------------
  it('detects search — latest keyword', () => {
    const r = classifyPrompt("what's the latest news about OpenAI?");
    expect(r.task).toBe('search');
  });

  it('detects search — current price', () => {
    const r = classifyPrompt('what is the current price of Bitcoin?');
    expect(r.task).toBe('search');
    expect(r.slot).toBe('search_fast');
  });

  it('detects search — today keyword', () => {
    const r = classifyPrompt('what happened in tech today?');
    expect(r.task).toBe('search');
  });

  // -------------------------------------------------------------------------
  // Coding
  // -------------------------------------------------------------------------
  it('detects coding — code fence', () => {
    const r = classifyPrompt('fix this:\n```python\ndef foo():\n  return 1/0\n```');
    expect(r.task).toBe('coding');
    expect(r.slot).toBe('coding_fast'); // balanced tier default
  });

  it('detects coding — write a function', () => {
    const r = classifyPrompt('write a function to reverse a linked list in TypeScript');
    expect(r.task).toBe('coding');
  });

  it('detects coding — SQL keyword', () => {
    const r = classifyPrompt('write a SQL query to find duplicate rows in a table');
    expect(r.task).toBe('coding');
  });

  it('coding routes to coding_premium on premium tier', () => {
    const r = classifyPrompt('implement a full OAuth2 server in Rust', {
      autoModeId: 'auto-premium',
    });
    expect(r.task).toBe('coding');
    expect(r.slot).toBe('coding_premium');
  });

  // -------------------------------------------------------------------------
  // Reasoning
  // -------------------------------------------------------------------------
  it('detects reasoning — step by step', () => {
    const r = classifyPrompt('solve this step by step: 3x² + 2x - 8 = 0');
    expect(r.task).toBe('reasoning');
  });

  it('detects reasoning — math keyword', () => {
    const r = classifyPrompt('explain the mathematics behind gradient descent');
    expect(r.task).toBe('reasoning');
  });

  it('reasoning routes to reasoning_premium on premium tier', () => {
    const r = classifyPrompt('prove that the square root of 2 is irrational', {
      autoModeId: 'auto-premium',
    });
    expect(r.task).toBe('reasoning');
    expect(r.slot).toBe('reasoning_premium');
  });

  // -------------------------------------------------------------------------
  // Vision (attachment)
  // -------------------------------------------------------------------------
  it('detects vision when image attachment present', () => {
    const r = classifyPrompt('what is in this image?', { hasImageAttachment: true });
    expect(r.task).toBe('vision');
    expect(r.slot).toBe('vision_fast');
  });

  it('vision routes to vision_premium on premium tier', () => {
    const r = classifyPrompt('describe this diagram in detail', {
      hasImageAttachment: true,
      autoModeId: 'auto-premium',
    });
    expect(r.slot).toBe('vision_premium');
  });

  // -------------------------------------------------------------------------
  // Long context
  // -------------------------------------------------------------------------
  it('detects long context for very long prompt', () => {
    const longPrompt = 'word '.repeat(2500); // ≈ 12500 chars ≈ 3125 tokens
    const r = classifyPrompt(longPrompt);
    expect(r.task).toBe('long_context');
    expect(r.slot).toBe('vision_premium'); // Gemini 3.1 Pro for long context
  });

  // -------------------------------------------------------------------------
  // Creative writing
  // -------------------------------------------------------------------------
  it('detects creative writing — write a story', () => {
    const r = classifyPrompt('write a short story about a robot learning to paint');
    expect(r.task).toBe('creative_writing');
  });

  it('detects creative writing — poem', () => {
    const r = classifyPrompt('write a haiku about autumn leaves');
    expect(r.task).toBe('creative_writing');
  });

  it('creative writing routes to creative_writing slot on balanced tier', () => {
    const r = classifyPrompt('write a screenplay scene set in 1920s Paris', {
      autoModeId: 'auto-balanced',
    });
    expect(r.task).toBe('creative_writing');
    expect(r.slot).toBe('creative_writing');
  });

  it('creative writing routes to general_fast on economy tier', () => {
    const r = classifyPrompt('write a short poem about coffee', { autoModeId: 'auto-economy' });
    expect(r.slot).toBe('general_fast');
  });

  it('creative writing routes to creative_writing_premium on premium tier', () => {
    const r = classifyPrompt('write a screenplay scene set in 1920s Paris', {
      autoModeId: 'auto-premium',
    });
    expect(r.task).toBe('creative_writing');
    expect(r.slot).toBe('creative_writing_premium');
  });

  // -------------------------------------------------------------------------
  // Simple chat
  // -------------------------------------------------------------------------
  it('detects simple chat for very short prompts', () => {
    const r = classifyPrompt('hi there!');
    expect(r.task).toBe('simple_chat');
    expect(r.slot).toBe('general_fast');
  });

  // -------------------------------------------------------------------------
  // General fallback
  // -------------------------------------------------------------------------
  it('falls back to general for medium prompts without specific signals', () => {
    // ~55 tokens — no task-specific signals, not short enough for simple_chat
    const r = classifyPrompt(
      'I am planning to open a new restaurant in my city and would like some advice on how to choose the right location and attract customers during the first few months.',
    );
    expect(r.task).toBe('general');
    expect(r.slot).toBe('general_balanced');
  });

  it('general routes to general_premium on premium tier', () => {
    const r = classifyPrompt(
      'I am planning to open a new restaurant in my city and would like some advice on how to choose the right location and attract customers during the first few months.',
      { autoModeId: 'auto-premium' },
    );
    expect(r.task).toBe('general');
    expect(r.slot).toBe('general_premium');
  });

  // -------------------------------------------------------------------------
  // Priority ordering — higher priority wins
  // -------------------------------------------------------------------------
  it('computer_use wins over coding when both present', () => {
    const r = classifyPrompt('click the run button to execute this Python script');
    expect(r.task).toBe('computer_use');
  });

  it('image_generation wins over general description', () => {
    const r = classifyPrompt('create an image showing the concept of machine learning');
    expect(r.task).toBe('image_generation');
  });

  it('coding wins over reasoning when both present', () => {
    const r = classifyPrompt('step by step, implement a binary search algorithm in Python');
    expect(r.task).toBe('coding'); // coding has higher priority than reasoning
  });
});

// ---------------------------------------------------------------------------
// buildRoutingDecision
// ---------------------------------------------------------------------------
describe('buildRoutingDecision', () => {
  it('returns a RoutingDecision with wasRouted=true', () => {
    const d = buildRoutingDecision('write a Python script');
    expect(d.wasRouted).toBe(true);
    expect(d.routedModelId).toBeTruthy();
    expect(typeof d.timestamp).toBe('number');
  });

  it('returns task alongside the decision', () => {
    const d = buildRoutingDecision('generate an image of a dog');
    expect(d.task).toBe('image_generation');
  });

  it('includes a human-readable reason', () => {
    const d = buildRoutingDecision('search for the latest AI news');
    expect(d.reason).toBeTruthy();
    expect(d.reason.length).toBeGreaterThan(3);
  });
});
