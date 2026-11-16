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

describe('answerFormatCardType', () => {
  it('drops the comparison view when a product comparison card already shows it', () => {
    expect(answerFormatCardType(COMPARISON, ['product-comparison.v1'])).toBeNull();
    expect(answerFormatCardType(COMPARISON, ['places.v1'])).toBe('comparison');
    expect(answerFormatCardType(RECIPE, ['product-comparison.v1'])).toBe('recipe');
    expect(answerFormatCardType(COMPARISON)).toBe('comparison');
  });
});
