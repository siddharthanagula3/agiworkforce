import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  turnCarriesImagesTheModelCannotRead,
  type ChatCompletionRequest,
} from './request-processor';

const imageTurn: ChatCompletionRequest['messages'] = [
  { role: 'user', content: 'what is in the first photo?' },
  { role: 'assistant', content: 'A harbour at dusk.' },
  {
    role: 'user',
    content: [
      { type: 'text', text: 'and this one?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ],
  },
] as ChatCompletionRequest['messages'];

const textTurn: ChatCompletionRequest['messages'] = [
  { role: 'user', content: 'summarise our conversation' },
] as ChatCompletionRequest['messages'];

describe('a turn is checked against the model it resolved to, not the one it started on', () => {
  it('refuses images for a model that cannot read them', () => {
    expect(turnCarriesImagesTheModelCannotRead(imageTurn, { vision: false })).toBe(true);
  });

  it('lets the same turn through once the model reads images', () => {
    expect(turnCarriesImagesTheModelCannotRead(imageTurn, { vision: true })).toBe(false);
  });

  it('never refuses a text-only turn on a text-only model', () => {
    expect(turnCarriesImagesTheModelCannotRead(textTurn, { vision: false })).toBe(false);
  });

  it('leaves an uncatalogued model to the provider rather than guessing', () => {
    expect(turnCarriesImagesTheModelCannotRead(imageTurn, undefined)).toBe(false);
  });
});
