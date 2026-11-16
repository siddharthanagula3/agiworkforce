import { describe, expect, it } from 'vitest';
import {
  appendExtraLine,
  parseCalculation,
  parseComparison,
  parseRecipe,
  parseSteps,
  stripListMarker,
  type ExtraSection,
} from './message-format-cards';

describe('message format card parsers', () => {
  it('reads steps and keeps an unclassified section as an extra', () => {
    const steps = parseSteps(
      [
        '# Deploy the service',
        '',
        'Follow these steps to ship a release.',
        '',
        '## Step 1: Build the image',
        '- Run the build script',
        '',
        '## Step 2: Push the tag',
        '- Tag with the release number',
        '',
        '## Troubleshooting',
        '- If the push fails, re-authenticate against the registry.',
      ].join('\n'),
    );
    expect(steps.title).toBe('Deploy the service');
    expect(steps.steps).toHaveLength(2);
    expect(JSON.stringify(steps.extraSections)).toContain('re-authenticate against the registry');
  });

  it('reads a calculation result and its steps', () => {
    const calculation = parseCalculation(
      [
        '## Monthly burn',
        '',
        'Step 1: Salaries = 42000',
        'Step 2: Hosting = 3000',
        'Result: 45000 USD',
      ].join('\n'),
    );
    expect(calculation.title).toBe('Monthly burn');
    expect(calculation.result).toContain('45000');
    expect(calculation.steps.length).toBeGreaterThan(0);
  });

  it('reads a calculation without the code fences around it', () => {
    const calculation = parseCalculation(
      [
        '## Totals',
        '',
        '$$a + b = c$$',
        '',
        '```ts:sec/a.ts',
        'const total: number = items.length;',
        '```',
        '',
        '> ```',
        '> result = 1 + 2',
        '> ```',
        '',
        '```x = 5``` is the code form',
        '',
        '```math',
        'x^2 = 4',
        '```',
        '',
        'Total: 7 apples',
        '',
        '````',
        '```',
        'not a close',
        '````',
        '',
        '~~~js',
        'const unfinished = 1;',
      ].join('\n'),
    );
    const text = JSON.stringify(calculation);
    expect(text).not.toMatch(/```|~~~|items\.length|result = 1|not a close|unfinished|sec\/a/);
    expect(calculation.formulas).toEqual(
      expect.arrayContaining([
        { label: '', expression: 'a + b = c', isLatex: true },
        { label: '', expression: 'x^2 = 4', isLatex: true },
      ]),
    );
    expect(calculation.result).toBe('7 apples');
  });

  it('reads a calculation without the code fences of an answer with Windows line endings', () => {
    const calculation = parseCalculation(
      ['## Calc', '```python', 'result = 1', '```', 'Total: 7'].join('\r\n'),
    );
    expect(JSON.stringify(calculation)).not.toMatch(/```|python|result = 1/);
    expect(calculation.result).toBe('7');
  });

  it('reads both sides of a comparison and the winner', () => {
    const comparison = parseComparison(
      [
        '# Postgres vs MySQL',
        '',
        '## Postgres',
        '### Pros',
        '- Rich type system',
        '',
        '## MySQL',
        '### Pros',
        '- Simple replication',
        '',
        '## Winner',
        'Overall, Postgres wins on correctness.',
      ].join('\n'),
    );
    expect(comparison.items.map((item) => item.name)).toEqual(['Postgres', 'MySQL']);
    expect(comparison.winner).toBe('Postgres');
  });

  it('reads recipe ingredients and instructions', () => {
    const recipe = parseRecipe(
      [
        '# Pancakes',
        '',
        'Servings: 4',
        '',
        '## Ingredients',
        '- 200g flour',
        '',
        '## Instructions',
        '1. Mix everything',
      ].join('\n'),
    );
    expect(recipe.title).toBe('Pancakes');
    expect(recipe.ingredients).toHaveLength(1);
    expect(recipe.instructions).toHaveLength(1);
  });

  it('groups extra lines under their heading and strips list markers', () => {
    const sections: ExtraSection[] = [];
    appendExtraLine(sections, 'Notes', ' first ');
    appendExtraLine(sections, 'Notes', 'second');
    appendExtraLine(sections, 'Notes', '   ');
    expect(sections).toEqual([{ heading: 'Notes', lines: ['first', 'second'] }]);
    expect(stripListMarker('1. **Bold** step')).toBe('Bold step');
  });
});
