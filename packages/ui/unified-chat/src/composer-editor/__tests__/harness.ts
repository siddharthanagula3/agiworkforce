import './dom-stubs';
import { Editor, isMacOS } from '@tiptap/core';
import { createComposerExtensions } from '../extensions';
import type { ComposerExtensionsConfig } from '../extensions';
import { COMPOSER_PROGRAMMATIC_META } from '../extensions/max-length';
import { SEND_ON_ENTER } from '../extensions/submit-keymap';
import { textToComposerDocument } from '../serialization';

export function createTestEditor(overrides: Partial<ComposerExtensionsConfig> = {}): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: createComposerExtensions({
      resolveMention: () => undefined,
      resolveLimit: () => null,
      resolveSendShortcut: () => SEND_ON_ENTER,
      onSubmit: () => undefined,
      isMenuActive: () => false,
      onMenuKey: () => false,
      ...overrides,
    }),
  });
}

export function seedText(editor: Editor, text: string): void {
  editor
    .chain()
    .setMeta(COMPOSER_PROGRAMMATIC_META, true)
    .setContent(textToComposerDocument(text))
    .run();
}

export function pressKey(editor: Editor, init: KeyboardEventInit & { key: string }): boolean {
  const event = new KeyboardEvent('keydown', init);
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false;
}

export function modifierKey(): KeyboardEventInit {
  return isMacOS() ? { metaKey: true } : { ctrlKey: true };
}

export function setComposing(editor: Editor, composing: boolean): void {
  Object.defineProperty(editor.view, 'composing', { value: composing, configurable: true });
}

const ALPHABET = ['a', 'B', ' ', '\n', '@', '/', '_', '.', '9', 'é', '漢', '\t'];
const SEED_MULTIPLIER = 1_664_525;
const SEED_INCREMENT = 1_013_904_223;
const SEED_MODULUS = 2 ** 32;
const MAX_GENERATED_LENGTH = 24;

export function generateStrings(count: number, seed = 1): string[] {
  let state = seed;
  const next = (): number => {
    state = (state * SEED_MULTIPLIER + SEED_INCREMENT) % SEED_MODULUS;
    return state;
  };
  return Array.from({ length: count }, () => {
    const length = next() % MAX_GENERATED_LENGTH;
    return Array.from({ length }, () => ALPHABET[next() % ALPHABET.length] ?? '').join('');
  });
}
