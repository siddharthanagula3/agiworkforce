import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_SYSTEM_PROMPT,
  SUPPORT_SYSTEM_PROMPT_V2,
  buildSupportSystemPrompt,
} from '../prompt/system-prompt';

const SOURCE = readFileSync(join(__dirname, '..', 'prompt', 'system-prompt.ts'), 'utf8');

describe('support system prompt', () => {
  it('is a zero-argument constant', () => {
    expect(buildSupportSystemPrompt.length).toBe(0);
    expect(buildSupportSystemPrompt()).toBe(SUPPORT_SYSTEM_PROMPT);
    expect(typeof SUPPORT_SYSTEM_PROMPT).toBe('string');
    expect(SUPPORT_SYSTEM_PROMPT.length).toBeGreaterThan(400);
  });

  it('contains no template interpolation and no placeholder syntax', () => {
    expect(SUPPORT_SYSTEM_PROMPT).not.toMatch(/\$\{/);
    expect(SUPPORT_SYSTEM_PROMPT).not.toMatch(/\{\{/);
    expect(SUPPORT_SYSTEM_PROMPT).not.toMatch(/%s|%d/);
  });

  it('is declared as a literal in source, with no concatenation or interpolation', () => {
    const declaration = SOURCE.slice(
      SOURCE.indexOf('export const SUPPORT_SYSTEM_PROMPT'),
      SOURCE.indexOf('export function buildSupportSystemPrompt'),
    );
    expect(declaration).toContain('export const SUPPORT_SYSTEM_PROMPT = `');
    expect(declaration).not.toContain('${');
    expect(declaration).not.toMatch(/\+\s*$/m);
  });

  it('imports nothing, it cannot reach user data, corpus data, or the database', () => {
    expect(SOURCE).not.toMatch(/^import\s/m);
  });

  it('tells the model that excerpts are untrusted and that it must not invent facts', () => {
    expect(SUPPORT_SYSTEM_PROMPT).toContain('untrusted');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('abstain');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('citedChunkIds');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('discarded');
  });
});

describe('support system prompt, version 2', () => {
  it('is its own literal, declared before the builder so the literal check above covers it', () => {
    expect(SUPPORT_SYSTEM_PROMPT_V2).not.toBe(SUPPORT_SYSTEM_PROMPT);
    const declared = SOURCE.indexOf('export const SUPPORT_SYSTEM_PROMPT_V2 = `');
    expect(declared).toBeGreaterThan(SOURCE.indexOf('export const SUPPORT_SYSTEM_PROMPT = `'));
    expect(declared).toBeLessThan(SOURCE.indexOf('export function buildSupportSystemPrompt'));
  });

  it('contains no template interpolation and no placeholder syntax', () => {
    expect(SUPPORT_SYSTEM_PROMPT_V2).not.toMatch(/\$\{/);
    expect(SUPPORT_SYSTEM_PROMPT_V2).not.toMatch(/\{\{/);
    expect(SUPPORT_SYSTEM_PROMPT_V2).not.toMatch(/%s|%d/);
  });

  it('keeps everything version 1 tells the model about excerpts, citations and the output shape', () => {
    for (const phrase of ['untrusted', 'abstain', 'citedChunkIds', 'discarded']) {
      expect(SUPPORT_SYSTEM_PROMPT_V2).toContain(phrase);
    }
    const versionOneBehaviour = SUPPORT_SYSTEM_PROMPT.slice(
      SUPPORT_SYSTEM_PROMPT.indexOf('- If the excerpts do not answer the question'),
    );
    expect(SUPPORT_SYSTEM_PROMPT_V2.endsWith(versionOneBehaviour)).toBe(true);
  });

  it('limits the model to product support and names the exact refusal reason the engine reads', () => {
    expect(SUPPORT_SYSTEM_PROMPT_V2).toContain('only questions about using AGI Workforce');
    expect(SUPPORT_SYSTEM_PROMPT_V2).toContain('"abstainReason" to exactly "out_of_scope"');
    for (const refused of ['code', 'essays', 'translate', 'homework', 'play a role']) {
      expect(SUPPORT_SYSTEM_PROMPT_V2).toContain(refused);
    }
    expect(SUPPORT_SYSTEM_PROMPT_V2).toContain('Never use a markdown code fence');
  });
});
