import DOMPurify from 'dompurify';
import markdownit from 'markdown-it';
import { closeUnterminatedCodeFence } from '@agiworkforce/utils/markdown-source';

let domPurifyHookInstalled = false;

export function ensureDomPurifyHook(): void {
  if (domPurifyHookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
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
      's',
      'ins',
      'mark',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'colspan', 'rowspan', 'start'],
    ADD_URI_SAFE_ATTR: ['colspan', 'rowspan', 'start'],
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

const SAFE_HREF = /^(?:https?|mailto):/i;

const md = markdownit({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

md.validateLink = () => true;

md.core.ruler.push('side_panel_links', (state) => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    let droppedLink = false;
    block.children = block.children.filter((token) => {
      if (token.type === 'link_close' && droppedLink) {
        droppedLink = false;
        return false;
      }
      if (token.type !== 'link_open') return true;
      const href = String(token.attrGet('href') ?? '');
      if (!href) {
        droppedLink = true;
        return false;
      }
      token.attrSet('href', SAFE_HREF.test(href) ? href.replace(/'/g, '%27') : '#');
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
      return true;
    });
  }
});

const escapeText = (text: string): string => md.utils.escapeHtml(text).replace(/'/g, '&#39;');

md.renderer.rules['text'] = (tokens, index) => escapeText(tokens[index]?.content ?? '');

const renderCode = (content: string): string =>
  `<pre><code>${escapeText(content.replace(/\n$/, ''))}</code></pre>\n`;

md.renderer.rules['fence'] = (tokens, index) => renderCode(tokens[index]?.content ?? '');

md.renderer.rules['code_block'] = (tokens, index) => renderCode(tokens[index]?.content ?? '');

md.renderer.rules['image'] = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const src = String(token.attrGet('src') ?? '');
  const label = escapeText(token.content || src);
  if (!SAFE_HREF.test(src)) return label;
  return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
};

export function renderMarkdown(text: string): string {
  return md.render(closeUnterminatedCodeFence(text));
}
