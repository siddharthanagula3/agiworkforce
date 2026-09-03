import { describe, expect, it } from 'vitest';

import { modelSupportsResearch, RESEARCH_MIN_CONTEXT_WINDOW } from './research-capability-gate';

describe('modelSupportsResearch', () => {
  it('grants a model that declares the research capability directly', () => {
    expect(modelSupportsResearch({ research: true, tools: false }, 0)).toBe(true);
  });

  it('grants a tool-capable model whose context window meets the threshold', () => {
    expect(
      modelSupportsResearch({ research: false, tools: true }, RESEARCH_MIN_CONTEXT_WINDOW),
    ).toBe(true);
  });

  it('refuses a tool-capable model below the context window threshold', () => {
    expect(
      modelSupportsResearch({ research: false, tools: true }, RESEARCH_MIN_CONTEXT_WINDOW - 1),
    ).toBe(false);
  });

  it('refuses a wide context window without tool support', () => {
    expect(
      modelSupportsResearch({ research: false, tools: false }, RESEARCH_MIN_CONTEXT_WINDOW),
    ).toBe(false);
  });

  it('refuses when capabilities are unknown', () => {
    expect(modelSupportsResearch(undefined, RESEARCH_MIN_CONTEXT_WINDOW)).toBe(false);
  });

  it('refuses when the context window is unknown', () => {
    expect(modelSupportsResearch({ research: false, tools: true }, undefined)).toBe(false);
  });
});
