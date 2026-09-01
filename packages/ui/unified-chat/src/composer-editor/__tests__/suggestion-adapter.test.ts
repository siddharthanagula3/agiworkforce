import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { COMPOSER_MENTION_NODE_NAME, COMPOSER_MENTION_PLUGIN_KEY } from '../extensions/mention';
import { composerText } from '../serialization';
import type { ComposerMentionMenuState } from '../types';
import { createTestEditor } from './harness';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function recordingMenu() {
  const states: ComposerMentionMenuState[] = [];
  const onOpen = vi.fn((state: ComposerMentionMenuState) => void states.push(state));
  const onUpdate = vi.fn((state: ComposerMentionMenuState) => void states.push(state));
  const onClose = vi.fn();
  const onKeyDown = vi.fn((_event: KeyboardEvent) => false);
  return { menu: { onOpen, onUpdate, onClose, onKeyDown }, states };
}

function lastState(states: ComposerMentionMenuState[]): ComposerMentionMenuState {
  const state = states[states.length - 1];
  if (!state) throw new Error('the mention menu never opened');
  return state;
}

function type(instance: Editor, text: string): void {
  for (const character of text) {
    instance.chain().focus('end').insertContent({ type: 'text', text: character }).run();
  }
}

function isSuggestionActive(instance: Editor): boolean {
  const state: unknown = COMPOSER_MENTION_PLUGIN_KEY.getState(instance.state);
  return typeof state === 'object' && state !== null && 'active' in state
    ? state.active === true
    : false;
}

describe('composer suggestion adapter', () => {
  it('opens the host menu on the trigger and reports every query change', () => {
    const { menu, states } = recordingMenu();
    editor = createTestEditor({ resolveMention: () => ({ menu }) });
    type(editor, 'hi @ad');

    expect(menu.onOpen).toHaveBeenCalledTimes(1);
    expect(states.map((state) => state.query)).toEqual(['', '', 'a', 'ad']);
    expect(isSuggestionActive(editor)).toBe(true);
  });

  it('closes the host menu when the query stops matching', () => {
    const { menu } = recordingMenu();
    editor = createTestEditor({ resolveMention: () => ({ menu }) });
    type(editor, '@ad ');
    expect(menu.onClose).toHaveBeenCalledTimes(1);
    expect(isSuggestionActive(editor)).toBe(false);
  });

  it('commits a chip that serializes to the plain-text form', () => {
    const { menu, states } = recordingMenu();
    editor = createTestEditor({ resolveMention: () => ({ menu }) });
    type(editor, 'ping @ad');
    lastState(states).commit.insertMention({ id: 'ada', label: 'ada' });

    expect(composerText(editor)).toBe('ping @ada ');
    const nodeNames: string[] = [];
    editor.state.doc.descendants((node) => void nodeNames.push(node.type.name));
    expect(nodeNames).toContain(COMPOSER_MENTION_NODE_NAME);
  });

  it('removes the query without inserting anything when the host asks it to', () => {
    const { menu, states } = recordingMenu();
    editor = createTestEditor({ resolveMention: () => ({ menu }) });
    type(editor, 'ping @ad');
    lastState(states).commit.removeQuery();

    expect(composerText(editor)).toBe('ping ');
  });

  it('hands keys to the host menu only while it is open', () => {
    const { menu } = recordingMenu();
    editor = createTestEditor({ resolveMention: () => ({ menu }) });
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    const dispatch = (): boolean =>
      editor?.view.someProp('handleKeyDown', (handler) => handler(editor!.view, event)) ?? false;

    dispatch();
    expect(menu.onKeyDown).not.toHaveBeenCalled();

    type(editor, '@ad');
    dispatch();
    expect(menu.onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('leaves the composer alone when no mention config is supplied', () => {
    editor = createTestEditor();
    type(editor, 'hi @ad');
    expect(composerText(editor)).toBe('hi @ad');
  });
});
