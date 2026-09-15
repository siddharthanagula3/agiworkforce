import { afterEach, describe, expect, it } from 'vitest';
import {
  MODEL_MEMORY_EXTRACTION_ENV,
  isModelMemoryExtractionEnabled,
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
