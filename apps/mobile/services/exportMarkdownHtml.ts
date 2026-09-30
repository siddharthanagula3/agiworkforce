import { normalizeMarkdownSource } from '@agiworkforce/utils/markdown-source';
import { lightColors } from '@/src/ui/theme/tokens';
import { KATEX_JS_URL } from '@/src/features/chat/utils/katexAssets';

const ESCAPABLE_PUNCTUATION = /[!-/:-@[-`{-~]/;
const SAFE_LINK = /^(?:https?:|mailto:)/i;
const HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|(\d{1,9})[.)])\s+(.*)$/;
const TASK_MARKER = /^\[([ xX])\]\s+/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const DISPLAY_MATH = '$$';
const HELD_FRAGMENT = /\ue000(\d+)\ue001/g;

export const EXPORT_CONTENT_STYLES = `
  .content a { color: ${lightColors.agentActive}; }
  .content pre {
    background: ${lightColors.surfaceBase};
    border: 1px solid ${lightColors.accentBorder};
    color: ${lightColors.textPrimary};
    padding: 12px;
    border-radius: 8px;
    font-family: Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .content code {
    background: ${lightColors.surfaceHover};
    padding: 1px 5px;
    border-radius: 4px;
    font-family: Menlo, monospace;
    font-size: 13px;
  }
  .content pre code { background: none; padding: 0; font-size: inherit; }
  .content table { border-collapse: collapse; margin: 12px 0; width: 100%; font-size: 13px; }
  .content th, .content td {
    border: 1px solid ${lightColors.accentBorder};
    padding: 6px 8px;
    vertical-align: top;
  }
  .content th { background: ${lightColors.surfaceBase}; font-weight: 600; }
  .content tr, .content blockquote, .content img, .content .math.display {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .content h1, .content h2, .content h3, .content h4 {
    page-break-after: avoid;
    break-after: avoid;
  }
  .content thead { display: table-header-group; }
  .content img { max-width: 100%; }
  .content blockquote {
    margin: 8px 0;
    padding: 2px 12px;
    border-left: 3px solid ${lightColors.accentBorder};
    color: ${lightColors.textSecondary};
  }
  .content hr { border: none; border-top: 1px solid ${lightColors.accentBorder}; margin: 16px 0; }
  .content ul, .content ol { padding-left: 22px; margin: 8px 0; }
  .content li { margin: 4px 0; }
  .content p { margin: 8px 0; line-height: 1.6; }
  .content .math.display { display: block; text-align: center; margin: 12px 0; }
  .content .math:not(.rendered) { font-family: Menlo, monospace; font-size: 13px; }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMathEnd(text: string, open: number): number {
  if (text[open + 1] === '$') return -1;
  const close = text.indexOf('$', open + 1);
  if (close <= open + 1 || text[close - 1] === '\\' || text[close + 1] === '$') return -1;
  return close;
}

function renderInline(text: string): string {
  const held: string[] = [];
  const hold = (html: string) => `\ue000${held.push(html) - 1}\ue001`;
  let plain = '';
  let idx = 0;
  while (idx < text.length) {
    const ch = text[idx]!;
    const next = text[idx + 1];
    if (ch === '\\' && next !== undefined && ESCAPABLE_PUNCTUATION.test(next)) {
      plain += hold(escapeHtml(next));
      idx += 2;
      continue;
    }
    if (ch === '`') {
      const close = text.indexOf('`', idx + 1);
      if (close > idx + 1) {
        plain += hold(`<code>${escapeHtml(text.slice(idx + 1, close))}</code>`);
        idx = close + 1;
        continue;
      }
    }
    if (ch === '$') {
      const close = inlineMathEnd(text, idx);
      if (close !== -1) {
        plain += hold(`<span class="math">${escapeHtml(text.slice(idx + 1, close).trim())}</span>`);
        idx = close + 1;
        continue;
      }
    }
    plain += ch;
    idx += 1;
  }
  return escapeHtml(plain)
    .replace(
      /!?\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g,
      (_match, label: string, href: string) => {
        const url = href.replace(/&amp;/g, '&');
        return SAFE_LINK.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
      },
    )
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>')
    .replace(/(?<![*\w])\*(?=\S)(.+?)(?<=\S)\*(?![*\w])/g, '<em>$1</em>')
    .replace(/(?<![_\w])_(?=\S)(.+?)(?<=\S)_(?![_\w])/g, '<em>$1</em>')
    .replace(HELD_FRAGMENT, (_match, index: string) => held[Number(index)] ?? '');
}

interface ListItem {
  indent: number;
  ordered: boolean;
  start: number;
  text: string;
}

function listItemHtml(text: string): string {
  const task = TASK_MARKER.exec(text);
  if (!task) return renderInline(text);
  return `${task[1] === ' ' ? '☐' : '☑'} ${renderInline(text.slice(task[0].length))}`;
}

function renderList(items: readonly ListItem[]): string {
  let html = '';
  const open: { indent: number; ordered: boolean }[] = [];
  const openList = (item: ListItem) => {
    html += item.ordered ? `<ol start="${item.start}">` : '<ul>';
    open.push({ indent: item.indent, ordered: item.ordered });
  };
  const closeList = () => {
    const list = open.pop();
    if (list) html += `</li></${list.ordered ? 'ol' : 'ul'}>`;
  };
  for (const item of items) {
    while (open.length > 1 && item.indent < open[open.length - 1]!.indent) closeList();
    const current = open[open.length - 1];
    if (!current || item.indent > current.indent) {
      openList(item);
    } else if (current.ordered !== item.ordered) {
      closeList();
      openList(item);
    } else {
      html += '</li>';
    }
    html += `<li>${listItemHtml(item.text)}`;
  }
  while (open.length > 0) closeList();
  return html;
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function columnAlignment(cell: string | undefined): string {
  const left = cell?.startsWith(':') ?? false;
  const right = cell?.endsWith(':') ?? false;
  return left && right ? 'center' : right ? 'right' : 'left';
}

function renderTable(header: string[], separator: string[], rows: string[][]): string {
  const cell = (tag: 'th' | 'td', text: string | undefined, column: number) =>
    `<${tag} style="text-align:${columnAlignment(separator[column])}">${renderInline(text ?? '')}</${tag}>`;
  const head = `<tr>${header.map((text, column) => cell('th', text, column)).join('')}</tr>`;
  const body = rows
    .map((row) => `<tr>${header.map((_, column) => cell('td', row[column], column)).join('')}</tr>`)
    .join('');
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function renderBlocks(lines: readonly string[]): string {
  const out: string[] = [];
  const startsTable = (at: number) => {
    const header = lines[at] ?? '';
    const separator = lines[at + 1] ?? '';
    return (
      header.includes('|') &&
      TABLE_SEPARATOR.test(separator) &&
      splitRow(header).length === splitRow(separator).length
    );
  };
  const displayMathEnd = (at: number) => {
    const opening = (lines[at] ?? '').trim();
    if (!opening.startsWith(DISPLAY_MATH)) return -1;
    if (opening.indexOf(DISPLAY_MATH, DISPLAY_MATH.length) !== -1) return at;
    for (let end = at + 1; end < lines.length; end += 1) {
      if (lines[end]!.includes(DISPLAY_MATH)) return end;
    }
    return -1;
  };
  const startsBlock = (at: number) => {
    const line = lines[at] ?? '';
    return (
      HEADING.test(line) ||
      FENCE.test(line) ||
      RULE.test(line) ||
      LIST_ITEM.test(line) ||
      line.trimStart().startsWith('>') ||
      displayMathEnd(at) !== -1 ||
      startsTable(at)
    );
  };

  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx]!;
    if (!line.trim()) {
      idx += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      idx += 1;
      while (idx < lines.length && !lines[idx]!.trimStart().startsWith(marker)) {
        body.push(lines[idx]!);
        idx += 1;
      }
      idx += 1;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const mathEnd = displayMathEnd(idx);
    if (mathEnd !== -1) {
      const source = lines
        .slice(idx, mathEnd + 1)
        .join('\n')
        .trim();
      const tex = source.slice(DISPLAY_MATH.length, source.lastIndexOf(DISPLAY_MATH));
      out.push(`<div class="math display">${escapeHtml(tex.trim())}</div>`);
      idx = mathEnd + 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      idx += 1;
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr/>');
      idx += 1;
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const quoted: string[] = [];
      while (idx < lines.length && lines[idx]!.trimStart().startsWith('>')) {
        quoted.push(lines[idx]!.trimStart().replace(/^>\s?/, ''));
        idx += 1;
      }
      out.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`);
      continue;
    }

    if (startsTable(idx)) {
      const header = splitRow(line);
      const separator = splitRow(lines[idx + 1]!);
      const rows: string[][] = [];
      idx += 2;
      while (idx < lines.length && lines[idx]!.trim() && lines[idx]!.includes('|')) {
        rows.push(splitRow(lines[idx]!));
        idx += 1;
      }
      out.push(renderTable(header, separator, rows));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items: ListItem[] = [];
      while (idx < lines.length) {
        const current = lines[idx]!;
        const item = LIST_ITEM.exec(current);
        if (item) {
          items.push({
            indent: item[1]!.replace(/\t/g, '    ').length,
            ordered: item[2] !== undefined,
            start: Number(item[2] ?? 1),
            text: item[3]!,
          });
        } else if (items.length > 0 && /^\s+\S/.test(current) && !startsBlock(idx)) {
          items[items.length - 1]!.text += ` ${current.trim()}`;
        } else {
          break;
        }
        idx += 1;
      }
      out.push(renderList(items));
      continue;
    }

    const paragraph: string[] = [];
    while (
      idx < lines.length &&
      lines[idx]!.trim() &&
      (paragraph.length === 0 || !startsBlock(idx))
    ) {
      paragraph.push(lines[idx]!.trim());
      idx += 1;
    }
    out.push(`<p>${paragraph.map(renderInline).join('<br/>')}</p>`);
  }
  return out.join('\n');
}

export function markdownToExportHtml(markdown: string): { html: string; hasMath: boolean } {
  const html = renderBlocks(normalizeMarkdownSource(markdown).split('\n'));
  return { html, hasMath: html.includes('class="math') };
}

export const EXPORT_MATH_SCRIPT = [
  `<script src="${KATEX_JS_URL}"></script>`,
  '<script>',
  "document.querySelectorAll('.math').forEach(function (node) {",
  '  try {',
  "    katex.render(node.textContent || '', node, { displayMode: node.classList.contains('display'), output: 'mathml', throwOnError: false });",
  "    node.classList.add('rendered');",
  '  } catch (error) {',
  "    node.setAttribute('data-math-error', String(error));",
  '  }',
  '});',
  '</script>',
].join('\n');
