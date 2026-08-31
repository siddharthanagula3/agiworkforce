import React from 'react';

/**
 * Recover the source text of a rendered node tree.
 *
 * A syntax highlighter replaces a code fence's single text child with a tree of
 * elements, one per token. `String(children)` then yields "[object Object]"
 * for every element and joins them with commas, which is what reached the
 * clipboard. Walking the tree is the only way to get the bytes back.
 */
export function reactNodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeText).join('');

  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return reactNodeText(props.children);
  }

  return '';
}
