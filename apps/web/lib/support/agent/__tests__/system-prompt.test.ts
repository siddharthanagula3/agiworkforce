
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORT_SYSTEM_PROMPT, buildSupportSystemPrompt } from '../prompt/system-prompt';

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

  it('imports nothing — it cannot reach user data, corpus data, or the database', () => {
    expect(SOURCE).not.toMatch(/^import\s/m);
  });

  it('tells the model that excerpts are untrusted and that it must not invent facts', () => {
    expect(SUPPORT_SYSTEM_PROMPT).toContain('untrusted');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('abstain');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('citedChunkIds');
    expect(SUPPORT_SYSTEM_PROMPT).toContain('discarded');
  });
});
