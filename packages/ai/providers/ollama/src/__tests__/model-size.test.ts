import { describe, expect, it } from 'vitest';

import {
  OLLAMA_PARAMETER_COUNT_KEY,
  ollamaModelSizeBillion,
  parseOllamaParameterCount,
  parseOllamaParameterSize,
} from '../model-size';

describe('parseOllamaParameterSize', () => {
  it('reads millions as a fraction of a billion', () => {
    expect(parseOllamaParameterSize('494M')).toBeCloseTo(0.494, 6);
  });

  it('reads a fractional million', () => {
    expect(parseOllamaParameterSize('134.52M')).toBeCloseTo(0.13452, 6);
  });

  it('reads a sub-billion value already written in billions', () => {
    expect(parseOllamaParameterSize('0.5B')).toBe(0.5);
  });

  it('reads a value just above the minimum', () => {
    expect(parseOllamaParameterSize('1.1B')).toBe(1.1);
  });

  it('reads a multi-billion value', () => {
    expect(parseOllamaParameterSize('7.6B')).toBe(7.6);
  });

  it('accepts a lowercase unit and surrounding space', () => {
    expect(parseOllamaParameterSize(' 3.2b ')).toBe(3.2);
  });

  it('returns nothing for a missing size', () => {
    expect(parseOllamaParameterSize(undefined)).toBeUndefined();
    expect(parseOllamaParameterSize('')).toBeUndefined();
  });

  it('returns nothing for a size with no unit it can trust', () => {
    expect(parseOllamaParameterSize('7')).toBeUndefined();
    expect(parseOllamaParameterSize('large')).toBeUndefined();
  });
});

describe('parseOllamaParameterCount', () => {
  it('converts a raw parameter count to billions', () => {
    expect(parseOllamaParameterCount(494_032_768)).toBeCloseTo(0.494032768, 9);
  });

  it('refuses a count that is not a positive number', () => {
    expect(parseOllamaParameterCount(0)).toBeUndefined();
    expect(parseOllamaParameterCount(-1)).toBeUndefined();
    expect(parseOllamaParameterCount(null)).toBeUndefined();
  });
});

describe('ollamaModelSizeBillion', () => {
  it('prefers the parameter size string', () => {
    expect(
      ollamaModelSizeBillion({
        parameterSize: '7.6B',
        modelInfo: { [OLLAMA_PARAMETER_COUNT_KEY]: 494_032_768 },
      }),
    ).toBe(7.6);
  });

  it('falls back to the parameter count when no size string is published', () => {
    expect(
      ollamaModelSizeBillion({
        modelInfo: { [OLLAMA_PARAMETER_COUNT_KEY]: 1_543_714_304 },
      }),
    ).toBeCloseTo(1.543714304, 9);
  });

  it('returns nothing when neither source says a size', () => {
    expect(
      ollamaModelSizeBillion({ modelInfo: { 'general.architecture': 'qwen2' } }),
    ).toBeUndefined();
  });
});
