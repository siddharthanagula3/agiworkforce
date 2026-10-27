import { describe, expect, it } from 'vitest';

import { separateGluedStatements } from './statement-lines';

describe('glued Python statements', () => {
  it('puts the newline back between an assignment and print', () => {
    expect(separateGluedStatements('message = "UPDATED_VALUE"print(message)')).toBe(
      'message = "UPDATED_VALUE"\nprint(message)',
    );
  });

  it('leaves a statement that already has its newline', () => {
    const source = 'message = "ORIGINAL_VALUE"\nprint(message)\n';
    expect(separateGluedStatements(source)).toBe(source);
  });

  it('does not split the word print inside a string', () => {
    expect(separateGluedStatements('message = "print(message)"')).toBe(
      'message = "print(message)"',
    );
  });
});
