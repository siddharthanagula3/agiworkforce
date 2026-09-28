import DOMPurify from 'dompurify';
import { closeUnterminatedCodeFence } from '@agiworkforce/utils/markdown-source';

let domPurifyHookInstalled = false;

export function ensureDomPurifyHook(): void {
  if (domPurifyHookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    const hasTarget = node.hasAttribute('target');
    if (!hasTarget) return;
    const existing = (node.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
    const required = ['noopener', 'noreferrer'];
    for (const flag of required) {
      if (!existing.includes(flag)) existing.push(flag);
    }
    node.setAttribute('rel', existing.filter(Boolean).join(' '));
  });
  domPurifyHookInstalled = true;
}

export function sanitizeHtml(dirty: string): string {
  ensureDomPurifyHook();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'code',
      'pre',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'span',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'sup',
      'sub',
      'del',
      'ins',
      'mark',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'colspan', 'rowspan'],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'textarea',
      'select',
      'button',
      'img',
    ],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'src',
      'class',
      'id',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

const TABLE_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function tableCells(row: string): string[] {
  let trimmed = row.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function renderTableBlocks(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = lines[index] ?? '';
    const delimiter = lines[index + 1];
    const headCells = tableCells(header);
    if (
      header.includes('|') &&
      delimiter !== undefined &&
      TABLE_DELIMITER.test(delimiter) &&
      tableCells(delimiter).length === headCells.length
    ) {
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|')) {
        rows.push(tableCells(lines[index] ?? ''));
        index += 1;
      }
      const head = `<thead><tr>${headCells.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead>`;
      const body = rows.length
        ? `<tbody>${rows
            .map(
              (row) =>
                `<tr>${headCells.map((_cell, column) => `<td>${row[column] ?? ''}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody>`
        : '';
      out.push('', `<table>${head}${body}</table>`, '');
      continue;
    }
    out.push(header);
    index += 1;
  }
  return out.join('\n');
}

function renderTables(html: string): string {
  return html
    .split(/(<pre><code>[\s\S]*?<\/code><\/pre>)/)
    .map((segment, position) => (position % 2 === 1 ? segment : renderTableBlocks(segment)))
    .join('');
}

export function renderMarkdown(text: string): string {
  let html = closeUnterminatedCodeFence(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_m, _info, code: string) => {
    return `<pre><code>${code.trimEnd()}</code></pre>`;
  });

  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  html = html.replace(/^ {0,3}### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^ {0,3}## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^ {0,3}# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/^---+$/gm, '<hr>');

  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>)|$)/g, '<ul>$1</ul>$2');

  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(
    /\[([^\]]+)\]\(((?:[^()]|\([^()]*\))+)\)/g,
    (_match: string, text: string, url: string) => {
      const rawUrl = url.trim();
      const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : '#';
      // & < > are already entity-escaped by the first pass; only quotes can still break the attribute.
      const encodedHref = safeUrl.replace(/"/g, '%22').replace(/'/g, '%27');
      const encodedText = text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      return `<a href="${encodedHref}" target="_blank" rel="noopener noreferrer">${encodedText}</a>`;
    },
  );

  html = renderTables(html);

  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr|table)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}
