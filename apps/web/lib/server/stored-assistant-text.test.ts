import { describe, expect, it } from 'vitest';

import {
  withoutStoredCitationMarkup,
  withoutStoredCitationMarkupRow,
} from './stored-assistant-text';

const REFERENCE = 'citeturn620734view2';

describe('withoutStoredCitationMarkup', () => {
  it('removes citation markup from an assistant answer stored before the stream filter', () => {
    const [row] = withoutStoredCitationMarkup([
      { id: 'a', role: 'assistant', content: `Starship flew again. ${REFERENCE}\n\nNext.` },
    ]);
    expect(row?.content).toBe('Starship flew again. \n\nNext.');
  });

  it('leaves user text, clean answers and rows without text as they are', () => {
    const user = { id: 'u', role: 'user', content: `Please explain ${REFERENCE}` };
    const clean = { id: 'c', role: 'assistant', content: 'Nothing to remove.' };
    const empty = { id: 'e', role: 'assistant', content: null };
    const rows = [user, clean, empty];
    const out = withoutStoredCitationMarkup(rows);
    expect(out[0]).toBe(user);
    expect(out[1]).toBe(clean);
    expect(out[2]).toBe(empty);
  });

  it('does not change the rows it was given', () => {
    const row = { id: 'a', role: 'assistant', content: `Done.${REFERENCE}` };
    withoutStoredCitationMarkup([row]);
    expect(row.content).toBe(`Done.${REFERENCE}`);
  });
});

describe('withoutStoredCitationMarkupRow', () => {
  it('cleans one assistant row and returns any other row as it is', () => {
    const assistant = withoutStoredCitationMarkupRow({
      role: 'assistant',
      content: `Done.${REFERENCE}`,
    });
    expect(assistant.content).toBe('Done.');
    const user = { role: 'user', content: `Done.${REFERENCE}` };
    expect(withoutStoredCitationMarkupRow(user)).toBe(user);
  });
});
