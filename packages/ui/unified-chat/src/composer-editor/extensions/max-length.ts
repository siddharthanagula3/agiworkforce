import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { composerDocumentToText } from '../serialization';

export const COMPOSER_MAX_LENGTH_EXTENSION_NAME = 'composerMaxLength';

export const COMPOSER_MAX_LENGTH_PLUGIN_KEY = new PluginKey(COMPOSER_MAX_LENGTH_EXTENSION_NAME);

export const COMPOSER_PROGRAMMATIC_META = 'composerProgrammatic';

export interface ComposerMaxLengthOptions {
  resolveLimit: () => number | null;
}

export const ComposerMaxLength = Extension.create<ComposerMaxLengthOptions>({
  name: COMPOSER_MAX_LENGTH_EXTENSION_NAME,

  addOptions() {
    return { resolveLimit: () => null };
  },

  addProseMirrorPlugins() {
    const { options } = this;
    return [
      new Plugin({
        key: COMPOSER_MAX_LENGTH_PLUGIN_KEY,
        filterTransaction: (transaction, state) => {
          if (!transaction.docChanged) return true;
          if (transaction.getMeta(COMPOSER_PROGRAMMATIC_META) === true) return true;
          const limit = options.resolveLimit();
          if (limit === null) return true;
          const next = composerDocumentToText(transaction.doc).length;
          if (next <= limit) return true;
          return next <= composerDocumentToText(state.doc).length;
        },
      }),
    ];
  },
});
