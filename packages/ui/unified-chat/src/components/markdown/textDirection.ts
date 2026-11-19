import type { DocumentBlock, DocumentInline } from './markdownDocument';

export type DocumentDirection = 'ltr' | 'rtl';

export const RIGHT_TO_LEFT_TEXT = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/u;
const STRONG_LETTER = /\p{L}/u;

export function textDirection(text: string): DocumentDirection | null {
  for (const char of text) {
    if (RIGHT_TO_LEFT_TEXT.test(char)) return 'rtl';
    if (STRONG_LETTER.test(char)) return 'ltr';
  }
  return null;
}

function inlinesDirection(inlines: readonly DocumentInline[]): DocumentDirection | null {
  for (const inline of inlines) {
    if (inline.kind !== 'text') continue;
    const direction = textDirection(inline.text);
    if (direction) return direction;
  }
  return null;
}

function blockDirection(block: DocumentBlock): DocumentDirection | null {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
      return inlinesDirection(block.inlines);
    case 'list':
      for (const item of block.items) {
        const direction = blocksDirection(item.blocks);
        if (direction) return direction;
      }
      return null;
    case 'quote':
      return blocksDirection(block.blocks);
    case 'table':
      for (const row of block.rows) {
        for (const cell of row) {
          const direction = inlinesDirection(cell);
          if (direction) return direction;
        }
      }
      return null;
    default:
      return null;
  }
}

function blocksDirection(blocks: readonly DocumentBlock[]): DocumentDirection | null {
  for (const block of blocks) {
    const direction = blockDirection(block);
    if (direction) return direction;
  }
  return null;
}

export function documentDirection(
  blocks: readonly DocumentBlock[],
  title?: string,
): DocumentDirection {
  return blocksDirection(blocks) ?? (title ? textDirection(title) : null) ?? 'ltr';
}
