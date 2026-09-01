import { Extension } from '@tiptap/core';
import type { ComposerSendShortcut } from '../types';

export const COMPOSER_SUBMIT_KEYMAP_EXTENSION_NAME = 'composerSubmitKeymap';

export const SEND_ON_ENTER: ComposerSendShortcut = 'enter';

export const ENTER_KEY = 'Enter';
export const SHIFT_ENTER_KEY = 'Shift-Enter';
export const MOD_ENTER_KEY = 'Mod-Enter';
export const ARROW_UP_KEY = 'ArrowUp';
export const ARROW_DOWN_KEY = 'ArrowDown';
export const TAB_KEY = 'Tab';
export const ESCAPE_KEY = 'Escape';

export interface ComposerSubmitKeymapOptions {
  resolveSendShortcut: () => ComposerSendShortcut;
  onSubmit: () => void;
  isMenuActive: () => boolean;
  onMenuKey: (key: string) => boolean;
}

export const ComposerSubmitKeymap = Extension.create<ComposerSubmitKeymapOptions>({
  name: COMPOSER_SUBMIT_KEYMAP_EXTENSION_NAME,

  addOptions() {
    return {
      resolveSendShortcut: () => SEND_ON_ENTER,
      onSubmit: () => undefined,
      isMenuActive: () => false,
      onMenuKey: () => false,
    };
  },

  addKeyboardShortcuts() {
    const { options } = this;

    const delegate = (key: string): boolean => options.isMenuActive() && options.onMenuKey(key);

    return {
      [ENTER_KEY]: ({ editor }) => {
        if (delegate(ENTER_KEY)) return true;
        if (editor.view.composing) return false;
        if (options.isMenuActive()) return false;
        if (options.resolveSendShortcut() !== SEND_ON_ENTER) return false;
        options.onSubmit();
        return true;
      },
      [SHIFT_ENTER_KEY]: ({ editor }) => editor.commands.splitBlock(),
      [MOD_ENTER_KEY]: ({ editor }) => {
        if (editor.view.composing) return false;
        if (options.isMenuActive()) return false;
        options.onSubmit();
        return true;
      },
      [ARROW_UP_KEY]: () => delegate(ARROW_UP_KEY),
      [ARROW_DOWN_KEY]: () => delegate(ARROW_DOWN_KEY),
      [TAB_KEY]: () => delegate(TAB_KEY),
      [ESCAPE_KEY]: () => delegate(ESCAPE_KEY),
    };
  },
});
