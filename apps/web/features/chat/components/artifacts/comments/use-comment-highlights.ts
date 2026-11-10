'use client';

import { useEffect, type RefObject } from 'react';
import { bestOccurrence, windowAround, type OccurrenceContext } from '../text-occurrence';
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

export const commentUiProps = { 'data-artifact-comment-ui': '' } as const;

const COMMENT_UI_SELECTOR = '[data-artifact-comment-ui]';

function collectText(container: HTMLElement): { nodes: Text[]; starts: number[]; text: string } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(COMMENT_UI_SELECTOR)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    starts.push(text.length);
    nodes.push(node as Text);
    text += (node as Text).data;
  }
  return { nodes, starts, text };
}

export function readRangeContext(container: HTMLElement, range: Range): OccurrenceContext {
  let before = '';
  let after = '';
  for (const node of collectText(container).nodes) {
    if (node === range.startContainer || node === range.endContainer) {
      if (node === range.startContainer) before += node.data.slice(0, range.startOffset);
      if (node === range.endContainer) after += node.data.slice(range.endOffset);
      continue;
    }
    const side = range.comparePoint(node, 0);
    if (side < 0) before += node.data;
    else if (side > 0) after += node.data;
  }
  return { before, after };
}

export function findTextRange(
  container: HTMLElement,
  quote: string,
  context: { prefix?: string | undefined; suffix?: string | undefined } = {},
): Range | null {
  const needle = quote.replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  const { nodes, starts, text } = collectText(container);
  const flat = text.replace(/\s/g, ' ');
  const collapsed: number[] = [];
  let compact = '';
  for (let i = 0; i < flat.length; i += 1) {
    if (flat[i] === ' ' && compact.endsWith(' ')) continue;
    collapsed.push(i);
    compact += flat[i];
  }
  const matches: number[] = [];
  for (let at = compact.indexOf(needle); at >= 0; at = compact.indexOf(needle, at + 1)) {
    matches.push(at);
  }
  if (matches.length === 0) return null;
  const chosen = bestOccurrence(
    matches.map((at) => windowAround(compact, at, at + needle.length)),
    { before: context.prefix ?? '', after: context.suffix ?? '' },
  );
  if (chosen === null) return null;
  const at = matches[chosen]!;
  return rangeAt(nodes, starts, collapsed[at]!, collapsed[at + needle.length - 1]! + 1);
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
      const range = scope ? findTextRange(scope, anchor.quote, anchor) : null;
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
    const range = scope ? findTextRange(scope, anchor.quote, anchor) : null;
    const target = range?.startContainer.parentElement;
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return Boolean(target);
  }
  return false;
}
