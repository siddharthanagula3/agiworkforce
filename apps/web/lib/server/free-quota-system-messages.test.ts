import { describe, expect, it } from 'vitest';

import { freeQuotaSystemMessages } from './free-quota-system-messages';

describe('the system messages of a free quota turn', () => {
  it('puts the product preamble first and each personal block in its layer order', () => {
    expect(
      freeQuotaSystemMessages({
        preamble: 'product',
        personal: [
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
      personal: [
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

  it('sends no empty message when there is no preamble or a block is blank', () => {
    expect(
      freeQuotaSystemMessages({
        preamble: '',
        personal: [
          { layer: 'personalized', text: '' },
          { layer: 'memory', text: 'saved memory' },
        ],
      }),
    ).toEqual([{ role: 'system', content: 'saved memory' }]);
  });
});
