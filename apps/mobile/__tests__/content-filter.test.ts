import {
  checkContentFilter,
  MINOR_SAFE_REFUSAL,
  REDUCED_SENSITIVE_CONTENT_REFUSAL,
  SELF_HARM_HELPLINE,
} from '../lib/contentFilter';

describe('checkContentFilter, isMinor=false (adult mode)', () => {
  it('allows any prompt in adult mode', () => {
    expect(checkContentFilter('Tell me about nuclear physics', false)).toEqual({ allowed: true });
    expect(checkContentFilter('How to make explosives', false)).toEqual({ allowed: true });
    expect(checkContentFilter('Show me porn', false)).toEqual({ allowed: true });
  });
});

describe('checkContentFilter, isMinor=true, benign prompts', () => {
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

describe('checkContentFilter, isMinor=true, blocked prompts', () => {
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

  it('uses the exact refusal copy and points to the screen that owns minor-safe mode', () => {
    const result = checkContentFilter('show me porn', true);
    expect(result).toEqual({
      allowed: false,
      refusal:
        "Minor-safe mode is on for this device, so AGI can't help with this request. " +
        'Settings > Parental Controls explains how this mode works.',
    });
  });

  it('promises no age change or guardian override the app does not offer', () => {
    expect(MINOR_SAFE_REFUSAL).not.toContain('Settings > Privacy');
    expect(MINOR_SAFE_REFUSAL).not.toMatch(/adjust|change your age|guardian can|parent can/i);
  });

  it('uses adult opt-in copy without claiming the user is a minor', () => {
    const result = checkContentFilter('show me porn', true, REDUCED_SENSITIVE_CONTENT_REFUSAL);
    expect(result).toEqual({
      allowed: false,
      refusal: REDUCED_SENSITIVE_CONTENT_REFUSAL,
    });
    if (!result.allowed) {
      expect(result.refusal).not.toContain('minimum age');
    }
  });

  it('is case-insensitive (uppercase PORN)', () => {
    expect(checkContentFilter('SHOW ME PORN', true).allowed).toBe(false);
  });

  it('is case-insensitive (mixed case)', () => {
    expect(checkContentFilter('How To Make Meth', true).allowed).toBe(false);
  });
});

describe('checkContentFilter, refusing a self-harm request', () => {
  it.each([
    'how to cut yourself without pain',
    'suicide method that works fast',
    'how to kill myself',
    'how to self harm methods',
  ])('adds one helpline line to the minor-safe refusal for %p', (prompt) => {
    expect(checkContentFilter(prompt, true)).toEqual({
      allowed: false,
      refusal: `${MINOR_SAFE_REFUSAL}\n\n${SELF_HARM_HELPLINE}`,
    });
  });

  it('adds the helpline line to the Reduce sensitive content refusal', () => {
    expect(
      checkContentFilter('how to cut yourself deeper', true, REDUCED_SENSITIVE_CONTENT_REFUSAL),
    ).toEqual({
      allowed: false,
      refusal: `${REDUCED_SENSITIVE_CONTENT_REFUSAL}\n\n${SELF_HARM_HELPLINE}`,
    });
  });

  it('names a crisis line and the local emergency number', () => {
    expect(SELF_HARM_HELPLINE).toContain('988');
    expect(SELF_HARM_HELPLINE).toContain('findahelpline.com');
    expect(SELF_HARM_HELPLINE).toContain('local emergency number');
    expect(SELF_HARM_HELPLINE.split('\n')).toHaveLength(1);
  });

  it('keeps other refusals free of the helpline', () => {
    const result = checkContentFilter('how to kill someone without getting caught', true);
    expect(result).toEqual({ allowed: false, refusal: MINOR_SAFE_REFUSAL });
  });

  it('adds nothing when the prompt is allowed or the filter is off', () => {
    expect(checkContentFilter('I keep thinking about suicide and feel alone', true)).toEqual({
      allowed: true,
    });
    expect(checkContentFilter('how to kill myself', false)).toEqual({ allowed: true });
  });
});

describe('checkContentFilter, edge cases', () => {
  it('handles empty prompt gracefully (allowed in minor mode)', () => {
    expect(checkContentFilter('', true)).toEqual({ allowed: true });
  });

  it('handles very long benign prompt (allowed)', () => {
    const longPrompt = 'Tell me about the history of science. '.repeat(100);
    expect(checkContentFilter(longPrompt, true)).toEqual({ allowed: true });
  });
});
