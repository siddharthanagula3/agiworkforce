import { describe, expect, it } from 'vitest';
import { answerFormatCardType, detectCardType } from './message-format';

const COMPARISON = [
  '## Postgres vs MySQL',
  '',
  'Both are mature relational databases with different strengths for teams.',
].join('\n');

const RECIPE = [
  '## Ingredients',
  '- 2 eggs',
  '- 1 cup flour',
  '## Instructions',
  '1. Mix everything together.',
].join('\n');

describe('detectCardType', () => {
  it('finds a recipe and a comparison', () => {
    expect(detectCardType(RECIPE)).toBe('recipe');
    expect(detectCardType(COMPARISON)).toBe('comparison');
  });

  it('reads calculation signals only outside code fences', () => {
    const fencedOnly = [
      '## Calculation',
      '',
      'Here is the script that adds the order up.',
      '',
      '```python',
      '# Result of the order',
      'total = 1 + 2',
      'Total = 60',
      '```',
    ].join('\n');
    expect(detectCardType(fencedOnly)).toBeNull();
    expect(
      detectCardType(fencedOnly.replace('```python', '~~~').replace(/```$/, '~~~')),
    ).toBeNull();
    expect(detectCardType(`${fencedOnly}\n\nTotal = 60`)).toBe('calculation');
    expect(detectCardType(fencedOnly.replace(/\n/g, '\r\n'))).toBeNull();
    expect(
      detectCardType(
        ['## Calculation', '', 'The order adds up.', '', '```math', 'a + b = 3', '```'].join('\n'),
      ),
    ).toBe('calculation');
  });

  it('offers no card for short or plain answers', () => {
    expect(detectCardType('Short answer.')).toBeNull();
    expect(
      detectCardType('A plain paragraph that explains something without any structure at all.'),
    ).toBeNull();
  });
});

describe('detectCardType on long repeated input', () => {
  it('reads recipe headings after a long run of #', () => {
    expect(detectCardType(`Prep time 10 minutes\n**Ingredients**\n${'#'.repeat(60_000)}`)).toBe(
      'recipe',
    );
  });

  it('reads a vs heading after a long run of #', () => {
    expect(detectCardType(`${'#'.repeat(60_000)} Postgres vs MySQL`)).toBe('comparison');
  });

  it('finds no comparison or guide heading in a line of only #', () => {
    expect(detectCardType('#'.repeat(4_000))).toBeNull();
  });

  it('finds no vs heading across many short # words', () => {
    expect(detectCardType('#a '.repeat(100_000))).toBeNull();
    expect(detectCardType(`# Postgres${' '.repeat(100_000)}vs`)).toBeNull();
  });

  it('counts steps before a long run of blank lines', () => {
    expect(detectCardType(`Step 1 Mix\nStep 2 Bake\nStep 3 Serve${'\n'.repeat(100_000)}`)).toBe(
      'steps',
    );
  });

  it('counts bold numbered lead-ins before a long run of blank lines', () => {
    const guide = '## How to bake\n1. **Mix** the dough\n2. **Bake** it\n3. **Serve** warm';
    expect(detectCardType(`${guide}${'\n'.repeat(100_000)}`)).toBe('steps');
  });

  it('finds no display equation in a long run of $$', () => {
    expect(detectCardType('$$'.repeat(150_000))).toBeNull();
    expect(detectCardType(`## Calculation\n\n$$ a + b = 3 $$${'$$'.repeat(150_000)}`)).toBe(
      'calculation',
    );
  });

  it('finds no inline code result in a long run of operators', () => {
    expect(detectCardType(`## Calculation\n\n\`${'+'.repeat(4_000)}`)).toBeNull();
    expect(detectCardType(`## Calculation\n\n\`${'+'.repeat(4_000)} = 12\``)).toBe('calculation');
  });

  it('finds no bracketed equation in a long run of unclosed brackets', () => {
    expect(detectCardType('\\[a='.repeat(4_000))).toBeNull();
    expect(detectCardType(`## Formula\n\n${'\\[a='.repeat(4_000)}1\\]`)).toBe('calculation');
  });
});

describe('answerFormatCardType', () => {
  it('drops the comparison view when a product comparison card already shows it', () => {
    expect(answerFormatCardType(COMPARISON, ['product-comparison.v1'])).toBeNull();
    expect(answerFormatCardType(COMPARISON, ['places.v1'])).toBe('comparison');
    expect(answerFormatCardType(RECIPE, ['product-comparison.v1'])).toBe('recipe');
    expect(answerFormatCardType(COMPARISON)).toBe('comparison');
  });
});
