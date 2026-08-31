import { describe, expect, it } from 'vitest';

import type { ClarifyCardBody, InteractiveCard } from '@agiworkforce/types';

import {
  createClarifyToolDefinition,
  executeClarifyTool,
  isClarifyTool,
  CLARIFY_TOOL_NAME,
} from './clarify-tool-service';

const ctx = { toolCallId: 'call-1', now: () => new Date('2026-08-31T00:00:00.000Z') };

/** The card union includes an unrecognised variant that carries no body. */
function recognisedBody(card: InteractiveCard): ClarifyCardBody {
  if (!card.recognized || card.kind !== 'clarify.v1') {
    throw new Error(`expected a recognised clarify card, got ${card.kind}`);
  }
  return card.body;
}

const VALID = {
  prompt: 'Two things change the answer here.',
  questions: [
    {
      header: 'Scope',
      question: 'Which plots should this cover?',
      options: [{ label: 'Vegetable beds only' }, { label: 'The whole garden' }],
    },
  ],
};

describe('the clarify tool', () => {
  it('is recognised by name', () => {
    expect(isClarifyTool(CLARIFY_TOOL_NAME)).toBe(true);
    expect(isClarifyTool('search_maps')).toBe(false);
  });

  it('describes itself as producing selectable controls, not prose', () => {
    const def = createClarifyToolDefinition();
    expect(def.function.name).toBe(CLARIFY_TOOL_NAME);
    expect(def.function.description).toMatch(/selectable controls/i);
    expect(def.function.parameters.required).toEqual(['questions']);
  });

  it('builds a pending card the renderer can draw', () => {
    const outcome = executeClarifyTool(VALID, ctx);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.card.kind).toBe('clarify.v1');
    expect(outcome.card.recognized).toBe(true);
    const body = recognisedBody(outcome.card);
    expect(body.state.status).toBe('pending');
    expect(body.questions).toHaveLength(1);
  });

  it('always offers a way out of the option list', () => {
    // A fixed set of choices the user cannot escape is a worse question than
    // one asked in prose.
    const outcome = executeClarifyTool(VALID, ctx);
    if (!outcome.ok) throw new Error('expected ok');
    const body = recognisedBody(outcome.card);
    expect(body.questions.every((q) => q.isOther)).toBe(true);
  });

  it('carries a fallback that reads on a client which cannot draw the card', () => {
    const outcome = executeClarifyTool(VALID, ctx);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.card.fallback.text).toContain('Vegetable beds only');
    expect(outcome.card.fallback.text).toContain('The whole garden');
  });

  it('tells the model to wait rather than guess the answers', () => {
    const outcome = executeClarifyTool(VALID, ctx);
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.content).toMatch(/wait for the answers/i);
    expect(outcome.content).toMatch(/do not guess/i);
  });

  it('rejects a question with fewer than two options', () => {
    const outcome = executeClarifyTool(
      { questions: [{ header: 'Scope', question: 'Which?', options: [{ label: 'Only one' }] }] },
      ctx,
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.content).toMatch(/two and four selectable options/i);
  });

  it('rejects malformed input rather than emitting an unusable card', () => {
    expect(executeClarifyTool({}, ctx).ok).toBe(false);
    expect(executeClarifyTool({ questions: [] }, ctx).ok).toBe(false);
  });

  it('gives every option and question a stable id', () => {
    const outcome = executeClarifyTool(VALID, ctx);
    if (!outcome.ok) throw new Error('expected ok');
    const body = recognisedBody(outcome.card);
    expect(body.questions[0]!.id).toBe('q1');
    expect(body.questions[0]!.options.map((o) => o.id)).toEqual(['q1o1', 'q1o2']);
  });
});
