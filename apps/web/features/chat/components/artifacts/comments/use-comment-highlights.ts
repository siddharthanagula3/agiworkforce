'use client';

import { useEffect, type RefObject } from 'react';
import type { ArtifactCommentAnchor } from './artifact-comments-client';

export const COMMENT_HIGHLIGHT_NAME = 'artifact-comment';

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

function registry(): { highlights: HighlightRegistry; Highlight: HighlightConstructor } | null {
  if (typeof window === 'undefined') return null;
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (window as unknown as { Highlight?: HighlightConstructor }).Highlight;
  return css?.highlights && Highlight ? { highlights: css.highlights, Highlight } : null;
}

export function findTextRange(container: HTMLElement, quote: string): Range | null {
  const needle = quote.replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let text = '';
  const starts: number[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    starts.push(text.length);
    nodes.push(node as Text);
    text += (node as Text).data;
  }
  const flat = text.replace(/\s/g, ' ');
  let index = flat.indexOf(needle);
  if (index < 0) {
    const collapsed: number[] = [];
    let compact = '';
    for (let i = 0; i < flat.length; i += 1) {
      if (flat[i] === ' ' && compact.endsWith(' ')) continue;
      collapsed.push(i);
      compact += flat[i];
    }
    const at = compact.indexOf(needle);
    if (at < 0) return null;
    index = collapsed[at]!;
    const end = collapsed[at + needle.length - 1]! + 1;
    return rangeAt(nodes, starts, index, end);
  }
  return rangeAt(nodes, starts, index, index + needle.length);
}

function rangeAt(nodes: Text[], starts: number[], start: number, end: number): Range | null {
  const locate = (offset: number) => {
    let i = starts.length - 1;
    while (i > 0 && starts[i]! > offset) i -= 1;
    return { node: nodes[i]!, offset: offset - starts[i]! };
  };
  if (nodes.length === 0) return null;
  const from = locate(start);
  const to = locate(Math.max(start, end - 1));
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, Math.min(to.node.data.length, to.offset + 1));
  return range;
}

export function useCommentHighlights(
  containerRef: RefObject<HTMLElement | null>,
  anchors: readonly ArtifactCommentAnchor[],
  revision: unknown,
): void {
  useEffect(() => {
    const api = registry();
    const container = containerRef.current;
    if (!api || !container) return;
    const ranges = anchors.flatMap((anchor) => {
      if (anchor.kind !== 'text') return [];
      const scope =
        anchor.slide !== undefined
          ? (container.querySelector<HTMLElement>(`[data-slide-index="${anchor.slide}"]`) ?? null)
          : container;
      const range = scope ? findTextRange(scope, anchor.quote) : null;
      return range ? [range] : [];
    });
    if (ranges.length === 0) {
      api.highlights.delete(COMMENT_HIGHLIGHT_NAME);
      return;
    }
    api.highlights.set(COMMENT_HIGHLIGHT_NAME, new api.Highlight(...ranges));
    return () => api.highlights.delete(COMMENT_HIGHLIGHT_NAME);
  }, [containerRef, anchors, revision]);
}

export function scrollToAnchor(
  container: HTMLElement | null,
  anchor: ArtifactCommentAnchor,
): boolean {
  if (!container) return false;
  if (anchor.kind === 'text') {
    const scope =
      anchor.slide !== undefined
        ? container.querySelector<HTMLElement>(`[data-slide-index="${anchor.slide}"]`)
        : container;
    const range = scope ? findTextRange(scope, anchor.quote) : null;
    const target = range?.startContainer.parentElement;
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return Boolean(target);
  }
  return false;
}
