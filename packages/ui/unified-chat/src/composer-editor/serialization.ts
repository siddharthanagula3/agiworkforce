import { getText, getTextSerializersFromSchema } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export const COMPOSER_BLOCK_SEPARATOR = '\n';

export const COMPOSER_DOCUMENT_NODE_NAME = 'doc';
export const COMPOSER_PARAGRAPH_NODE_NAME = 'paragraph';
export const COMPOSER_TEXT_NODE_NAME = 'text';

function paragraph(line: string): JSONContent {
  return line.length === 0
    ? { type: COMPOSER_PARAGRAPH_NODE_NAME }
    : {
        type: COMPOSER_PARAGRAPH_NODE_NAME,
        content: [{ type: COMPOSER_TEXT_NODE_NAME, text: line }],
      };
}

export function textToComposerDocument(text: string): JSONContent {
  return {
    type: COMPOSER_DOCUMENT_NODE_NAME,
    content: text.split(COMPOSER_BLOCK_SEPARATOR).map(paragraph),
  };
}

export function composerDocumentToText(document: ProseMirrorNode): string {
  return getText(document, {
    blockSeparator: COMPOSER_BLOCK_SEPARATOR,
    textSerializers: getTextSerializersFromSchema(document.type.schema),
  });
}

export function composerText(editor: Editor): string {
  return composerDocumentToText(editor.state.doc);
}
