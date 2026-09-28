'use client';

import { useEffect, useState } from 'react';
import './text-match-highlight.css';

export const FIND_MATCH_HIGHLIGHT = 'agi-find-match';
export const JUMP_MATCH_HIGHLIGHT = 'agi-jump-match';

const MESSAGE_SELECTOR = '[data-message-id]';
const UNSEARCHED_ANCESTORS =
  'button, input, textarea, select, script, style, [aria-hidden="true"], .sr-only';
const TEXT_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, dt, dd, figcaption';
const BLOCK_SEPARATOR = '\n';
const MAX_HIGHLIGHTED_MATCHES = 500;
const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

interface TextPosition {
  readonly node: Text;
  readonly start: number;
}

function positionAt(
  positions: readonly TextPosition[],
  offset: number,
  isEnd: boolean,
): { node: Text; offset: number } | null {
  let low = 0;
  let high = positions.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const entry = positions[middle];
    if (!entry) return null;
    const end = entry.start + entry.node.data.length;
    if (isEnd ? offset <= entry.start : offset < entry.start) {
      high = middle - 1;
    } else if (isEnd ? offset > end : offset >= end) {
      low = middle + 1;
    } else {
      return { node: entry.node, offset: offset - entry.start };
    }
  }
  return null;
}

function highlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined' || typeof Highlight === 'undefined') return null;
  return (CSS as { highlights?: HighlightRegistry }).highlights ?? null;
}

function messageElements(messageId: string | null): Element[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR));
  return messageId ? all.filter((element) => element.dataset['messageId'] === messageId) : all;
}

function matchRanges(roots: readonly Element[], pattern: RegExp): Range[] {
  const ranges: Range[] = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest(UNSEARCHED_ANCESTORS)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const positions: TextPosition[] = [];
    let text = '';
    let block: Element | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node instanceof Text)) continue;
      const nodeBlock = node.parentElement?.closest(TEXT_BLOCKS) ?? root;
      if (positions.length > 0 && nodeBlock !== block) text += BLOCK_SEPARATOR;
      block = nodeBlock;
      positions.push({ node, start: text.length });
      text += node.data;
    }
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const start = positionAt(positions, match.index, false);
      const end = positionAt(positions, match.index + match[0].length, true);
      if (!start || !end) continue;
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
      if (ranges.length >= MAX_HIGHLIGHTED_MATCHES) return ranges;
    }
  }
  return ranges;
}

export function useTextMatchHighlight(
  name: string,
  query: string | null | undefined,
  messageId: string | null = null,
): void {
  useEffect(() => {
    const needle = query?.trim();
    const registry = highlightRegistry();
    if (!needle || !registry) return;

    const pattern = new RegExp(needle.replace(REGEXP_SPECIAL_CHARACTERS, '\\$&'), 'giu');
    let frame: number | null = null;
    const paint = () => {
      frame = null;
      registry.set(name, new Highlight(...matchRanges(messageElements(messageId), pattern)));
    };
    const schedulePaint = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };

    paint();
    const observer = new MutationObserver(schedulePaint);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      registry.delete(name);
    };
  }, [name, query, messageId]);
}

interface JumpTarget {
  readonly messageId: string;
  readonly query: string;
}

export function useSearchJumpHighlight(messageId: string | null, query: string | null): void {
  const [target, setTarget] = useState<JumpTarget | null>(null);

  useEffect(() => {
    const needle = query?.trim();
    if (messageId && needle) setTarget({ messageId, query: needle });
  }, [messageId, query]);

  useEffect(() => {
    if (!target) return;
    const clear = () => setTarget(null);
    const arm = setTimeout(() => window.addEventListener('pointerdown', clear, { once: true }), 0);
    return () => {
      clearTimeout(arm);
      window.removeEventListener('pointerdown', clear);
    };
  }, [target]);

  useTextMatchHighlight(JUMP_MATCH_HIGHLIGHT, target?.query ?? null, target?.messageId ?? null);
}
