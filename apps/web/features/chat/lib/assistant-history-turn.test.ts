import { describe, expect, it } from 'vitest';

import {
  EMPTY_ASSISTANT_TURN_HISTORY_TEXT,
  cardOnlyAssistantTurnContent,
  fillEmptyAssistantTurns,
} from './assistant-history-turn';

const PLACEHOLDER = String.fromCharCode(0x200b);

describe('fillEmptyAssistantTurns', () => {
  it('gives an assistant turn with no visible text a history line', () => {
    const filled = fillEmptyAssistantTurns([
      { role: 'user', content: 'show coffee shops on a map' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: PLACEHOLDER },
      { role: 'assistant', content: [{ type: 'text', text: ' ' }] },
      { role: 'user', content: 'what is 17 times 23' },
    ]);
    expect(filled.map((m) => m.content)).toEqual([
      'show coffee shops on a map',
      EMPTY_ASSISTANT_TURN_HISTORY_TEXT,
      EMPTY_ASSISTANT_TURN_HISTORY_TEXT,
      EMPTY_ASSISTANT_TURN_HISTORY_TEXT,
      'what is 17 times 23',
    ]);
  });

  it('leaves answers, tool-call turns, image parts and user turns alone', () => {
    const messages = [
      { role: 'assistant', content: '17 times 23 is 391.' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call-1' }] },
      {
        role: 'assistant',
        content: [{ type: 'image_url', image_url: { url: 'https://x/y.png' } }],
      },
      { role: 'user', content: '' },
    ];
    expect(fillEmptyAssistantTurns(messages)).toEqual(messages);
  });
});

describe('cardOnlyAssistantTurnContent', () => {
  it('names the card a text-free reply showed', () => {
    expect(
      cardOnlyAssistantTurnContent({
        role: 'assistant',
        content: PLACEHOLDER,
        metadata: {
          interactiveCards: [
            { fallback: { headline: 'Coffee near Union Square', text: 'Map search: coffee' } },
          ],
        },
      }),
    ).toBe(
      '[This reply had no text. It showed the user a card: "Coffee near Union Square". That request is answered.]',
    );
  });

  it('keeps the reply text when there is any', () => {
    expect(
      cardOnlyAssistantTurnContent({
        role: 'assistant',
        content: 'Here they are.',
        metadata: { interactiveCards: [{ fallback: { headline: 'Map', text: 'x' } }] },
      }),
    ).toBeNull();
  });
});
