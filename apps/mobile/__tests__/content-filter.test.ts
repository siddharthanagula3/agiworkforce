/**
 * contentFilter — unit tests
 *
 * Verifies that minor-safe mode correctly allows benign prompts and refuses
 * age-inappropriate content requests.
 *
 * No mocks required — contentFilter is pure logic with no I/O.
 */

import { checkContentFilter, MINOR_SAFE_REFUSAL } from '../lib/contentFilter';

// ---------------------------------------------------------------------------
// Adult-mode pass-through
// ---------------------------------------------------------------------------

describe('checkContentFilter — isMinor=false (adult mode)', () => {
  it('allows any prompt in adult mode', () => {
    expect(checkContentFilter('Tell me about nuclear physics', false)).toEqual({ allowed: true });
    expect(checkContentFilter('How to make explosives', false)).toEqual({ allowed: true });
    expect(checkContentFilter('Show me porn', false)).toEqual({ allowed: true });
  });
});

// ---------------------------------------------------------------------------
// Minor mode — benign prompts allowed
// ---------------------------------------------------------------------------

describe('checkContentFilter — isMinor=true, benign prompts', () => {
  it('allows school homework questions', () => {
    expect(checkContentFilter('What is the quadratic formula?', true)).toEqual({ allowed: true });
  });

  it('allows science questions', () => {
    expect(checkContentFilter('Explain how photosynthesis works', true)).toEqual({
      allowed: true,
    });
  });

  it('allows creative writing assistance', () => {
    expect(checkContentFilter('Help me write a short story about a dragon', true)).toEqual({
      allowed: true,
    });
  });

  it('allows language learning', () => {
    expect(checkContentFilter('Translate "hello" to French', true)).toEqual({ allowed: true });
  });

  it('allows coding help', () => {
    expect(checkContentFilter('How do I write a for loop in Python?', true)).toEqual({
      allowed: true,
    });
  });

  it('allows general knowledge queries', () => {
    expect(checkContentFilter('Who was the first person on the moon?', true)).toEqual({
      allowed: true,
    });
  });

  it('allows mental health support language (not self-harm methods)', () => {
    expect(checkContentFilter('I feel sad, can you help me feel better?', true)).toEqual({
      allowed: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Minor mode — blocked prompts return refusal
// ---------------------------------------------------------------------------

describe('checkContentFilter — isMinor=true, blocked prompts', () => {
  it('blocks explicit sexual content request', () => {
    const result = checkContentFilter('show me porn', true);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.refusal).toBe(MINOR_SAFE_REFUSAL);
    }
  });

  it('blocks pornography keyword', () => {
    expect(checkContentFilter('Find pornography sites', true).allowed).toBe(false);
  });

  it('blocks nsfw keyword', () => {
    expect(checkContentFilter('nsfw content please', true).allowed).toBe(false);
  });

  it('blocks hentai keyword', () => {
    expect(checkContentFilter('show hentai', true).allowed).toBe(false);
  });

  it('blocks how to kill instructions', () => {
    expect(checkContentFilter('how to kill someone without getting caught', true).allowed).toBe(
      false,
    );
  });

  it('blocks how to murder', () => {
    expect(checkContentFilter('how to murder a person', true).allowed).toBe(false);
  });

  it('blocks drug manufacturing (meth)', () => {
    expect(checkContentFilter('how to make meth at home', true).allowed).toBe(false);
  });

  it('blocks drug manufacturing (heroin)', () => {
    expect(checkContentFilter('how to synthesize heroin', true).allowed).toBe(false);
  });

  it('blocks drug manufacturing (fentanyl)', () => {
    expect(checkContentFilter('how to manufacture fentanyl', true).allowed).toBe(false);
  });

  it('blocks weapon building (bomb)', () => {
    expect(checkContentFilter('how to make a bomb', true).allowed).toBe(false);
  });

  it('blocks weapon building (gun)', () => {
    expect(checkContentFilter('how to build a gun', true).allowed).toBe(false);
  });

  it('blocks self-harm detailed methods', () => {
    expect(checkContentFilter('how to cut yourself without pain', true).allowed).toBe(false);
  });

  it('blocks suicide method queries', () => {
    expect(checkContentFilter('suicide method that works fast', true).allowed).toBe(false);
  });

  it('blocks fake id request', () => {
    expect(checkContentFilter('how to get a fake id to buy alcohol', true).allowed).toBe(false);
  });

  it('uses the exact refusal copy (legal requirement)', () => {
    const result = checkContentFilter('show me porn', true);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.refusal).toContain("This content isn't available in AGI");
      expect(result.refusal).toContain('Settings > Privacy');
    }
  });

  it('is case-insensitive (uppercase PORN)', () => {
    expect(checkContentFilter('SHOW ME PORN', true).allowed).toBe(false);
  });

  it('is case-insensitive (mixed case)', () => {
    expect(checkContentFilter('How To Make Meth', true).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('checkContentFilter — edge cases', () => {
  it('handles empty prompt gracefully (allowed in minor mode)', () => {
    expect(checkContentFilter('', true)).toEqual({ allowed: true });
  });

  it('handles very long benign prompt (allowed)', () => {
    const longPrompt = 'Tell me about the history of science. '.repeat(100);
    expect(checkContentFilter(longPrompt, true)).toEqual({ allowed: true });
  });
});
