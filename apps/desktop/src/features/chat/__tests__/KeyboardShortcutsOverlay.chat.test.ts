import { describe, expect, it } from 'vitest';
import { CHAT_INLINE_SECTION } from '../KeyboardShortcutsOverlay';

describe('CHAT_INLINE_SECTION', () => {
  it('names the send key the composer actually submits on', () => {
    expect(CHAT_INLINE_SECTION.shortcuts[0]).toEqual({
      description: 'Send message',
      keys: ['Enter'],
    });
  });

  it('names the key that breaks a line without sending', () => {
    expect(CHAT_INLINE_SECTION.shortcuts[1]?.keys).toEqual(['Shift', 'Enter']);
  });

  it('does not advertise Escape as a stop key or ArrowUp as message recall', () => {
    const rows = CHAT_INLINE_SECTION.shortcuts;
    const stop = rows.find((row) => row.description === 'Stop generation');
    expect(stop?.keys).toEqual(['Click stop']);
    expect(rows.some((row) => row.keys.includes('Escape'))).toBe(false);
    expect(rows.some((row) => row.keys.includes('↑'))).toBe(false);
    expect(rows.some((row) => /edit last message/i.test(row.description))).toBe(false);
  });
});
