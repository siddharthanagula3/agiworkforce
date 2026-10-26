import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

const DISPLAY_FENCE = '$$';
const INLINE_FENCE = '$';
const WHITESPACE = /\s/u;
const WORD_OR_DIGIT = /[\p{L}\p{N}]/u;

export const MATH_ATTRIBUTE = 'data-math';

function closingFence(src: string, fence: string, from: number): number {
  let end = src.indexOf(fence, from);
  while (end !== -1 && src[end - 1] === '\\') end = src.indexOf(fence, end + 1);
  return end;
}

function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state;
  if (src[pos] !== INLINE_FENCE) return false;
  const fence = src.startsWith(DISPLAY_FENCE, pos) ? DISPLAY_FENCE : INLINE_FENCE;
  const start = pos + fence.length;
  const end = closingFence(src, fence, start);
  if (end === -1 || end === start) return false;
  if (fence === INLINE_FENCE) {
    const before = src[pos - 1];
    const after = src[end + 1];
    if (before !== undefined && WORD_OR_DIGIT.test(before)) return false;
    if (WHITESPACE.test(src[start] ?? '') || WHITESPACE.test(src[end - 1] ?? '')) return false;
    if (after === INLINE_FENCE || (after !== undefined && WORD_OR_DIGIT.test(after))) return false;
  }
  if (!silent) {
    const token = state.push(
      fence === DISPLAY_FENCE ? 'math_inline_display' : 'math_inline',
      'math',
      0,
    );
    token.content = src.slice(start, end);
  }
  state.pos = end + fence.length;
  return true;
}

function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false;
  const lineStart = (line: number): number => (state.bMarks[line] ?? 0) + (state.tShift[line] ?? 0);
  const open = lineStart(startLine);
  if (!state.src.startsWith(DISPLAY_FENCE, open)) return false;
  const first = state.src.slice(open + DISPLAY_FENCE.length, state.eMarks[startLine]).trimEnd();
  let body: string[];
  let lastLine = startLine;
  if (first.endsWith(DISPLAY_FENCE)) {
    const inner = first.slice(0, -DISPLAY_FENCE.length);
    if (!inner.trim() || inner.includes(DISPLAY_FENCE)) return false;
    body = [inner];
  } else {
    if (first.includes(DISPLAY_FENCE)) return false;
    body = [first];
    let closed = false;
    for (let line = startLine + 1; line < endLine; line += 1) {
      const start = lineStart(line);
      const end = state.eMarks[line] ?? start;
      if (start < end && (state.sCount[line] ?? 0) < state.blkIndent) break;
      const text = state.src.slice(start, end).trimEnd();
      lastLine = line;
      if (text.endsWith(DISPLAY_FENCE)) {
        body.push(text.slice(0, -DISPLAY_FENCE.length));
        closed = true;
        break;
      }
      body.push(text);
    }
    if (!closed) return false;
  }
  if (silent) return true;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = body.join('\n');
  token.map = [startLine, lastLine + 1];
  state.line = lastLine + 1;
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  const escape = md.utils.escapeHtml;
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules['math_inline'] = (tokens, index) =>
    `<span ${MATH_ATTRIBUTE}="inline">${escape(tokens[index]?.content ?? '')}</span>`;
  md.renderer.rules['math_inline_display'] = (tokens, index) =>
    `<span ${MATH_ATTRIBUTE}="display">${escape((tokens[index]?.content ?? '').trim())}</span>`;
  md.renderer.rules['math_block'] = (tokens, index) =>
    `<div ${MATH_ATTRIBUTE}="display">${escape((tokens[index]?.content ?? '').trim())}</div>\n`;
}
