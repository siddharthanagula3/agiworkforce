import { describe, expect, it } from 'vitest';
import { toolArgumentProblem } from '../tool-argument-validation';

const schema = {
  type: 'object',
  properties: { content: { type: 'string' }, path: { type: 'string' } },
  required: ['content'],
};

describe('tool argument validation', () => {
  it('rejects malformed JSON even when the tool has no known schema', () => {
    expect(toolArgumentProblem({ args: {}, argsMalformed: true }, undefined)).toMatch(/valid JSON/);
  });

  it('distinguishes missing content from an explicit empty string', () => {
    expect(toolArgumentProblem({ args: {} }, schema)).toMatch(/missing required.*content/);
    expect(toolArgumentProblem({ args: { content: '' } }, schema)).toBeNull();
  });

  it.each([null, 12, [], {}])('rejects a wrongly typed required value: %j', (content) => {
    expect(toolArgumentProblem({ args: { content } }, schema)).toMatch(/content.*string/);
  });

  it('requires an own prototype-named argument', () => {
    const named = {
      type: 'object',
      properties: { constructor: { type: 'string' } },
      required: ['constructor'],
    };
    expect(toolArgumentProblem({ args: {} }, named)).toMatch(/missing required.*constructor/);
    expect(toolArgumentProblem({ args: { constructor: '' } }, named)).toBeNull();
  });

  it('retains optional-null handling and unknown-schema behavior', () => {
    expect(toolArgumentProblem({ args: { content: 'ok', path: null } }, schema)).toBeNull();
    expect(toolArgumentProblem({ args: {} }, undefined)).toBeNull();
  });
});
