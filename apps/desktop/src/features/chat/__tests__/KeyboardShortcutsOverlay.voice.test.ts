/**
 * The shortcuts cheatsheet must never advertise a voice key nothing handles.
 *
 * `hooks/useVoiceHotkey.ts` listens for exactly four configurable combos on the
 * document. The overlay previously hard-coded "Push to talk: Space" and
 * "Toggle voice mode: Cmd+Shift+V" — neither is a real handler (there is no
 * Space listener at all, and ctrl+shift+v is hold-to-talk, not a toggle).
 */
import { describe, expect, it } from 'vitest';
import { voiceInlineSection } from '../KeyboardShortcutsOverlay';
import type { VoiceInputHotkey } from '../../../stores/settingsStore';

const ALL_HOTKEYS: VoiceInputHotkey[] = ['option', 'ctrl+space', 'ctrl+shift+v', 'caps_lock'];

describe('voiceInlineSection', () => {
  it('renders exactly one entry, derived from the configured hotkey', () => {
    for (const hotkey of ALL_HOTKEYS) {
      expect(voiceInlineSection(hotkey).shortcuts).toHaveLength(1);
    }
  });

  it('maps each hotkey setting to the keys useVoiceHotkey actually matches', () => {
    expect(voiceInlineSection('option').shortcuts[0]?.keys).toEqual(['Alt/Option']);
    expect(voiceInlineSection('ctrl+space').shortcuts[0]?.keys).toEqual(['Ctrl/Cmd', 'Space']);
    expect(voiceInlineSection('ctrl+shift+v').shortcuts[0]?.keys).toEqual([
      'Ctrl/Cmd',
      'Shift',
      'V',
    ]);
    expect(voiceInlineSection('caps_lock').shortcuts[0]?.keys).toEqual(['Caps Lock']);
  });

  it('calls Caps Lock a toggle and every other hotkey a hold', () => {
    expect(voiceInlineSection('caps_lock').shortcuts[0]?.description).toMatch(/toggle/i);
    for (const hotkey of ALL_HOTKEYS.filter((k) => k !== 'caps_lock')) {
      expect(voiceInlineSection(hotkey).shortcuts[0]?.description).toMatch(/hold/i);
    }
  });

  it('never advertises a bare Space key or a system-wide claim', () => {
    for (const hotkey of ALL_HOTKEYS) {
      const entry = voiceInlineSection(hotkey).shortcuts[0];
      expect(entry?.keys).not.toEqual(['Space']);
      expect(entry?.description).not.toMatch(/system-wide|global/i);
      // Dictation is in-app only until the system path ships.
      expect(entry?.description).toMatch(/in app/i);
    }
  });
});
