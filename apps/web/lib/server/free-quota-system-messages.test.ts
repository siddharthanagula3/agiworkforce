import { describe, expect, it } from 'vitest';

import { freeQuotaSystemMessages } from './free-quota-system-messages';

describe('the system messages of a free quota turn', () => {
  it('puts the product preamble first and every other block in its layer order', () => {
    expect(
      freeQuotaSystemMessages({
        preamble: 'product',
        blocks: [
          { layer: 'memory', text: 'saved memory' },
          { layer: 'personalized', text: 'custom instructions' },
          { layer: 'memory', text: 'past chats' },
        ],
      }),
    ).toEqual([
      { role: 'system', content: 'product' },
      { role: 'system', content: 'custom instructions' },
      { role: 'system', content: 'saved memory' },
      { role: 'system', content: 'past chats' },
    ]);
  });

  it('never lets a project or personal block outrank the product preamble', () => {
    const messages = freeQuotaSystemMessages({
      preamble: 'product',
      blocks: [
        { layer: 'project', text: 'project instructions' },
        { layer: 'personalized', text: 'custom instructions' },
      ],
    });

    expect(messages.map((message) => message.content)).toEqual([
      'product',
      'project instructions',
      'custom instructions',
    ]);
  });

  it('keeps a turn note above the project block, whatever order they arrive in', () => {
    const messages = freeQuotaSystemMessages({
      preamble: 'product',
      blocks: [
        { layer: 'personalized', text: 'custom instructions' },
        { layer: 'project', text: 'project instructions' },
        { layer: 'developer', text: 'note for this turn' },
      ],
    });

    expect(messages.map((message) => message.content)).toEqual([
      'product',
      'note for this turn',
      'project instructions',
      'custom instructions',
    ]);
  });

  it('sends no empty message when there is no preamble or a block is blank', () => {
    expect(
      freeQuotaSystemMessages({
        preamble: '',
        blocks: [
          { layer: 'personalized', text: '' },
          { layer: 'memory', text: 'saved memory' },
        ],
      }),
    ).toEqual([{ role: 'system', content: 'saved memory' }]);
  });
});
