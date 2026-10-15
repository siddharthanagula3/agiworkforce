import { afterEach, describe, expect, it } from 'vitest';
import { SENSITIVE_MEMORY_SUBJECTS } from '@agiworkforce/context';
import {
  MODEL_MEMORY_EXTRACTION_ENV,
  isModelMemoryExtractionEnabled,
  memoryFactExtractionPrompt,
} from '../model-memory-extraction';

/**
 * The flag decides whether an extra provider call happens on every eligible
 * turn, so the only safe reading is an allowlist: an unset, empty, mistyped or
 * half-disabled variable has to mean off, because the failure of "off" is a
 * bill nobody approved.
 */
describe(MODEL_MEMORY_EXTRACTION_ENV, () => {
  afterEach(() => {
    delete process.env[MODEL_MEMORY_EXTRACTION_ENV];
  });

  it('is on when unset', () => {
    delete process.env[MODEL_MEMORY_EXTRACTION_ENV];
    expect(isModelMemoryExtractionEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'off', 'no', ' OFF ', 'False'])('is off for %o', (value) => {
    process.env[MODEL_MEMORY_EXTRACTION_ENV] = value;
    expect(isModelMemoryExtractionEnabled()).toBe(false);
  });

  it.each(['', ' ', '1', 'true', 'on', 'yes', 'enabled', ' TRUE '])('is on for %o', (value) => {
    process.env[MODEL_MEMORY_EXTRACTION_ENV] = value;
    expect(isModelMemoryExtractionEnabled()).toBe(true);
  });
});

describe('memoryFactExtractionPrompt', () => {
  const LEAVES_OUT_SENSITIVE_TOPICS = `Leave out any fact about the user's ${SENSITIVE_MEMORY_SUBJECTS}`;
  const NAMES_WHAT_MEMORY_NEVER_KEEPS = 'criminal history or immigration status';
  const SELECTS_STAGED_VERSIONS = {
    'product.memory_fact_extraction': 3,
    'product.memory_fact_extraction_all_topics': 2,
  };

  it('tells the extractor to leave sensitive topics and never-kept details out when the opt-in is off', () => {
    const prompt = memoryFactExtractionPrompt({ promptVariants: SELECTS_STAGED_VERSIONS });

    expect(prompt?.stamp).toBe('product.memory_fact_extraction@3');
    expect(prompt?.text).toContain(LEAVES_OUT_SENSITIVE_TOPICS);
    expect(prompt?.text).toContain(NAMES_WHAT_MEMORY_NEVER_KEEPS);
  });

  it('keeps the extractor reading every sensitive topic, but never a never-kept detail, while the opt-in is on', () => {
    const prompt = memoryFactExtractionPrompt({
      includeSensitiveTopics: true,
      promptVariants: SELECTS_STAGED_VERSIONS,
    });

    expect(prompt).toMatchObject({
      stamp: 'product.memory_fact_extraction_all_topics@2',
      selectedBy: 'variant',
    });
    expect(prompt?.text).not.toContain(LEAVES_OUT_SENSITIVE_TOPICS);
    expect(prompt?.text).toContain(NAMES_WHAT_MEMORY_NEVER_KEEPS);
  });

  it('stages a version that asks for a name, not an identity, and names what memory never keeps', () => {
    const staged = memoryFactExtractionPrompt({
      promptVariants: { 'product.memory_fact_extraction': 3 },
    });

    expect(staged?.stamp).toBe('product.memory_fact_extraction@3');
    expect(staged?.text).toContain('still true next week: name, role, employer');
    expect(staged?.text).toContain(LEAVES_OUT_SENSITIVE_TOPICS);
    expect(staged?.text).toContain(NAMES_WHAT_MEMORY_NEVER_KEEPS);
  });

  it('sends no prompt for an account with the opt-in on while the served version never names what memory never keeps', () => {
    expect(memoryFactExtractionPrompt({ includeSensitiveTopics: true })).toBeNull();
    expect(
      memoryFactExtractionPrompt({
        includeSensitiveTopics: true,
        promptVariants: { 'product.memory_fact_extraction_all_topics': 1 },
      }),
    ).toBeNull();
  });

  it('sends no prompt for an account without the opt-in while the served version reads every topic or keeps never-kept details', () => {
    expect(memoryFactExtractionPrompt({})).toBeNull();
    for (const version of [1, 2]) {
      expect(
        memoryFactExtractionPrompt({
          promptVariants: { 'product.memory_fact_extraction': version },
        }),
        `version ${version}`,
      ).toBeNull();
    }
  });
});
