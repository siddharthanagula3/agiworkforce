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

describe('message format card parsers on hostile model output', () => {
  const spaces = (count: number): string => ' '.repeat(count);

  it('does not take a pros heading padded with spaces before a stray carriage return as pros', () => {
    const comparison = parseComparison(
      ['# A vs B', '## A', `## Pros${spaces(250_000)}x\ry`, '- Fast'].join('\n'),
    );
    expect(comparison.items[0].pros).toEqual([]);
    expect(comparison.extraSections[comparison.extraSections.length - 1]?.lines).toEqual(['Fast']);
  });

  it('does not take a cons heading padded with spaces before a stray carriage return as cons', () => {
    const comparison = parseComparison(
      ['# A vs B', '## A', `## Cons${spaces(250_000)}x\ry`, '- Slow'].join('\n'),
    );
    expect(comparison.items[0].cons).toEqual([]);
    expect(comparison.extraSections[comparison.extraSections.length - 1]?.lines).toEqual(['Slow']);
  });

  it('does not take a winner heading padded with spaces before a stray carriage return as the verdict', () => {
    const comparison = parseComparison(
      ['# A vs B', `## Winner${spaces(250_000)}x\ry`, 'A wins.'].join('\n'),
    );
    expect(comparison.winner).toBe('');
    expect(comparison.winnerReason).toBe('');
  });

  it('reads a numbered step whose title or separator is a long run of spaces', () => {
    expect(parseSteps(`0\t${spaces(1_500)}x\ry`).steps).toEqual([]);
    expect(parseSteps(`1. a${spaces(250_000)}b`).steps).toEqual([
      { title: `a${spaces(250_000)}b`, details: [] },
    ]);
  });

  it('reads a bold step whose title or separator is a long run of spaces', () => {
    expect(parseSteps(`**step 0\t${spaces(1_500)}x\ry`).steps).toEqual([]);
    expect(parseSteps(`**Step 2: a${spaces(250_000)}b**`).steps).toEqual([
      { title: `a${spaces(250_000)}b`, details: [] },
    ]);
  });

  it('keeps a heading padded with spaces before a stray carriage return out of the steps', () => {
    const steps = parseSteps(['# Guide', `#${spaces(200_000)}x\ry`, 'Read this first.'].join('\n'));
    expect(steps.steps).toEqual([]);
    expect(steps.extraSections).toEqual([]);
    expect(steps.description).toBe('Read this first.');
  });

  it('reads display math after many unclosed openers', () => {
    expect(parseCalculation(`\\[${'\\[a'.repeat(200_000)}`).formulas).toEqual([]);
    expect(parseCalculation('Area:\n\\[ A = 12 \\]').formulas).toEqual([
      { label: '', expression: 'A = 12', isLatex: true },
    ]);
  });

  it('reads the last line of a formula that holds many unclosed environment tags', () => {
    const calculation = parseCalculation(`$$${'\\end{{'.repeat(100_000)}\\\\ x = 4$$`);
    expect(calculation.result).toBe('4');
    expect(calculation.resultIsLatex).toBe(true);
  });

  it('keeps a calculation heading padded with spaces before a stray carriage return out of the sections', () => {
    const calculation = parseCalculation(
      ['# Calc', `#${spaces(200_000)}x\ry`, 'Total: 7 apples'].join('\n'),
    );
    expect(calculation.extraSections).toEqual([]);
    expect(calculation.result).toBe('7 apples');
  });

  it('reads a calculation step whose label or separator is a long run of spaces', () => {
    expect(parseCalculation(`step 1:${spaces(8_000)}x`).steps).toEqual([]);
    expect(parseCalculation(`1. a${spaces(250_000)}b = 5`).steps).toEqual([
      { label: `a${spaces(250_000)}b`, value: '5' },
    ]);
  });

  it('reads inline code after an unclosed backtick full of operators', () => {
    expect(parseCalculation(`\`${'='.repeat(250_000)}`).formulas).toEqual([]);
    expect(parseCalculation('Use `a + b` here.').formulas).toEqual([
      { label: '', expression: 'a + b', isLatex: false },
    ]);
  });

  it('names both sides of a comparison whose title pads them with spaces', () => {
    expect(
      parseComparison(`# Postgres${spaces(200_000)}vs MySQL`).items.map((item) => item.name),
    ).toEqual(['Postgres', 'MySQL']);
    expect(parseComparison(`# a${spaces(200_000)}b`).items.map((item) => item.name)).toEqual([
      'Option A',
      'Option B',
    ]);
  });
});
