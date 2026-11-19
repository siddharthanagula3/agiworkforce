import {
  collectFencedCode,
  readFenceOpen,
} from '@/src/features/chat/components/markdownBlockSyntax';

const OPENING = /<(script|style)\b[^>]*>/i;
const BLOCK_OPENING = /^ {0,3}<(?:script|style)\b/i;
const INDENTED_CODE = /^(?: {4}|\t)/;
const COMMENT_OPEN = /^ {0,3}<!--/;
const COMMENT_CLOSE = '-->';

function insideCodeSpan(line: string, at: number): boolean {
  return (line.slice(0, at).split('`').length - 1) % 2 === 1;
}

type ClosingScan =
  | { readonly closed: true; readonly tail: string; readonly next: number }
  | { readonly closed: false; readonly stoppedEarly: boolean; readonly next: number };

function scanForClose(
  lines: readonly string[],
  from: number,
  findClose: (line: string) => { readonly at: number; readonly length: number } | null,
  stopAtBlankLine: boolean,
): ClosingScan {
  for (let scan = from; scan < lines.length; scan += 1) {
    const line = lines[scan]!;
    if (readFenceOpen(line) || (stopAtBlankLine && line.trim() === '')) {
      return { closed: false, stoppedEarly: true, next: scan };
    }
    const close = findClose(line);
    if (close) {
      return { closed: true, tail: line.slice(close.at + close.length), next: scan + 1 };
    }
  }
  return { closed: false, stoppedEarly: false, next: lines.length };
}

function closingTag(tag: string): (line: string) => { at: number; length: number } | null {
  const end = new RegExp(`</${tag}\\s*>`, 'i');
  return (line) => {
    const match = end.exec(line);
    return match ? { at: match.index, length: match[0].length } : null;
  };
}

function closingComment(line: string): { at: number; length: number } | null {
  const at = line.indexOf(COMMENT_CLOSE);
  return at < 0 ? null : { at, length: COMMENT_CLOSE.length };
}

export function dropHiddenHtmlBlocks(content: string, streaming = false): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx]!;
    const fence = readFenceOpen(line);
    if (fence) {
      const fenced = collectFencedCode(lines, idx, fence);
      out.push(...lines.slice(idx, fenced.next));
      idx = fenced.next;
      continue;
    }
    const comment = COMMENT_OPEN.exec(line);
    if (comment) {
      const opensAt = comment[0].length - 2;
      const sameLine = closingComment(line.slice(opensAt));
      const scan: ClosingScan = sameLine
        ? { closed: true, tail: line.slice(opensAt + sameLine.at + sameLine.length), next: idx + 1 }
        : scanForClose(lines, idx + 1, closingComment, false);
      if (scan.closed) out.push(scan.tail.trim() === '' ? '' : scan.tail);
      idx = scan.next;
      continue;
    }
    const open = INDENTED_CODE.test(line) ? null : OPENING.exec(line);
    if (!open || insideCodeSpan(line, open.index)) {
      out.push(line);
      idx += 1;
      continue;
    }
    const findClose = closingTag(open[1]!);
    if (findClose(line.slice(open.index + open[0].length))) {
      out.push(line);
      idx += 1;
      continue;
    }
    const startsBlock = BLOCK_OPENING.test(line);
    const scan = scanForClose(lines, idx + 1, findClose, !startsBlock);
    if (!scan.closed) {
      if (startsBlock && streaming && !scan.stoppedEarly) break;
      out.push(line);
      idx += 1;
      continue;
    }
    const head = line.slice(0, open.index);
    const kept = `${head}${scan.tail}`;
    if (kept.trim() !== '') out.push(kept);
    else if (head.trim() === '') out.push('');
    idx = scan.next;
  }
  return out.join('\n');
}
