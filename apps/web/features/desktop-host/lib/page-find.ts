/**
 * Find on the page the public desktop window is showing.
 *
 * The count and the highlight walk the same text nodes, so "2 of 4" is the
 * second range the selection lands on. The find bar itself is skipped: its
 * buttons would otherwise match the words Next and Previous.
 */

export interface PageFindMatch {
  node: Text;
  start: number;
  length: number;
}

export function stepPageFind(count: number, index: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (index < 0) return direction > 0 ? 0 : count - 1;
  return (index + direction + count) % count;
}

export function pageFindOccurrences(
  root: ParentNode,
  skip: Node | null,
  query: string,
): PageFindMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle || typeof document === 'undefined') return [];
  const matches: PageFindMatch[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (skip && (node === skip || skip.contains(node))) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    const text = current.textContent ?? '';
    const lower = text.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      matches.push({ node: current as Text, start: at, length: needle.length });
      from = at + needle.length;
    }
    current = walker.nextNode();
  }
  return matches;
}

export function applyPageFindSelection(match: PageFindMatch | undefined): void {
  const selection = document.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  if (!match) return;
  const range = document.createRange();
  range.setStart(match.node, match.start);
  range.setEnd(match.node, match.start + match.length);
  selection.addRange(range);
  match.node.parentElement?.scrollIntoView?.({ block: 'nearest' });
}
