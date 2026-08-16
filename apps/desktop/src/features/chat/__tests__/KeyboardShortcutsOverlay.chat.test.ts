import { describe, expect, it } from 'vitest';
import { chatInlineSection, type ComposerSendShortcut } from '../KeyboardShortcutsOverlay';

const ALL_SEND_SHORTCUTS: ComposerSendShortcut[] = ['enter', 'mod-enter'];

describe('chatInlineSection', () => {
  it('names the send key the composer actually submits on', () => {
    expect(chatInlineSection('enter').shortcuts[0]).toEqual({
      description: 'Send message',
      keys: ['Enter'],
    });
    expect(chatInlineSection('mod-enter').shortcuts[0]).toEqual({
      description: 'Send message',
      keys: ['Ctrl/Cmd', 'Enter'],
    });
  });

  it('names the key that breaks a line without sending', () => {
    expect(chatInlineSection('enter').shortcuts[1]?.keys).toEqual(['Shift', 'Enter']);
    expect(chatInlineSection('mod-enter').shortcuts[1]?.keys).toEqual(['Enter']);
  });

  it('never claims send and new line share a key', () => {
    for (const setting of ALL_SEND_SHORTCUTS) {
      const [send, newLine] = chatInlineSection(setting).shortcuts;
      expect(send?.keys).not.toEqual(newLine?.keys);
    }
  });

  it('does not advertise Escape as a stop key or ArrowUp as message recall', () => {
    for (const setting of ALL_SEND_SHORTCUTS) {
      const rows = chatInlineSection(setting).shortcuts;
      const stop = rows.find((row) => row.description === 'Stop generation');
      expect(stop?.keys).toEqual(['Click stop']);
      expect(rows.some((row) => row.keys.includes('Escape'))).toBe(false);
      expect(rows.some((row) => row.keys.includes('↑'))).toBe(false);
      expect(rows.some((row) => /edit last message/i.test(row.description))).toBe(false);
    }
  });
});
