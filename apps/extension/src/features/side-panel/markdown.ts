import DOMPurify from 'dompurify';
import katex from 'katex';
import katexStyles from 'katex/dist/katex.min.css?inline';
import markdownit from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItKatex from '@vscode/markdown-it-katex';
import { normalizeMarkdownSource } from '@agiworkforce/utils/markdown-source';
import { Copy, renderIcon } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';

// DOMPurify's SANITIZE_NAMED_PROPS prefix; it is not exported, and footnote
// hrefs must name the prefixed id or they land nowhere.
const SANITIZED_ID_PREFIX = 'user-content-';
const FRAGMENT = '#';
const COPIED_RESET_MS = 1500;

let domPurifyHookInstalled = false;

export function ensureDomPurifyHook(): void {
  if (domPurifyHookInstalled) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    if ((node.getAttribute('href') ?? '').startsWith(FRAGMENT)) {
      node.removeAttribute('target');
      node.removeAttribute('rel');
      return;
    }
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
      'section',
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
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'title',
      'colspan',
      'rowspan',
      'start',
      'id',
      'data-math',
    ],
    ADD_URI_SAFE_ATTR: ['colspan', 'rowspan', 'start', 'data-math'],
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
    ],
    ALLOW_DATA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#)/i,
  });
}

const SAFE_HREF = /^(?:(?:https?|mailto):|#)/i;
const SAFE_IMAGE_HREF = /^(?:https?|mailto):/i;

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
      if (href.startsWith(FRAGMENT)) return true;
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
  if (!SAFE_IMAGE_HREF.test(src)) return label;
  return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
};

md.use(markdownItFootnote);

const footnoteAnchorRule = md.renderer.rules['footnote_anchor_name'];
const footnoteCaptionRule = md.renderer.rules['footnote_caption'];

type FootnoteRuleArgs = Parameters<NonNullable<typeof footnoteAnchorRule>>;

function footnoteIds(...args: FootnoteRuleArgs): { note: string; ref: string } {
  const note = footnoteAnchorRule?.(...args) ?? '';
  const subId = Number(args[0][args[1]]?.meta?.['subId'] ?? 0);
  return { note, ref: subId > 0 ? `${note}:${subId}` : note };
}

md.renderer.rules['footnote_ref'] = (...args) => {
  const { note, ref } = footnoteIds(...args);
  const caption = footnoteCaptionRule?.(...args) ?? '';
  return `<sup><a href="#${SANITIZED_ID_PREFIX}fn${note}" id="fnref${ref}">${caption}</a></sup>`;
};

md.renderer.rules['footnote_block_open'] = () =>
  `<hr>\n<section aria-label="${escapeText(t('spFootnotes'))}">\n<ol>\n`;

md.renderer.rules['footnote_open'] = (...args) => `<li id="fn${footnoteIds(...args).ref}">`;

md.renderer.rules['footnote_anchor'] = (...args) => {
  const { ref } = footnoteIds(...args);
  const number = String(Number(args[0][args[1]]?.meta?.['id']) + 1);
  const label = escapeText(t('spFootnoteBackref', [number]));
  return ` <a href="#${SANITIZED_ID_PREFIX}fnref${ref}" aria-label="${label}">↩︎</a>`;
};

// The plugin is CommonJS with an __esModule default; this package is
// type: module, so the bundler hands back module.exports rather than the
// function, while vitest unwraps it. Accept both or the panel throws at load.
const katexPluginExports = markdownItKatex as typeof markdownItKatex & {
  default?: typeof markdownItKatex;
};
md.use(katexPluginExports.default ?? markdownItKatex);

const renderInlineMath = (content: string): string =>
  `<span data-math="inline">${escapeText(content)}</span>`;
const renderDisplayMath = (content: string): string =>
  `<div data-math="display">${escapeText(content.trim())}</div>\n`;

md.renderer.rules['math_inline'] = (tokens, index) =>
  renderInlineMath(tokens[index]?.content ?? '');
md.renderer.rules['math_block'] = (tokens, index) =>
  renderDisplayMath(tokens[index]?.content ?? '');
md.renderer.rules['math_inline_block'] = (tokens, index) =>
  renderDisplayMath(tokens[index]?.content ?? '');

let renderSequence = 0;

export function renderMarkdown(text: string): string {
  renderSequence += 1;
  return md.render(normalizeMarkdownSource(text), { docId: `m${renderSequence}` });
}

let mathStylesAdopted = false;

function adoptMathStyles(): void {
  if (mathStylesAdopted) return;
  mathStylesAdopted = true;
  if (
    !Array.isArray(document.adoptedStyleSheets) ||
    typeof CSSStyleSheet !== 'function' ||
    typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync !== 'function'
  ) {
    document.head.appendChild(el('style', {}, katexStyles));
    return;
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(katexStyles);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

function renderMath(root: HTMLElement): void {
  const nodes = root.querySelectorAll<HTMLElement>('[data-math]');
  if (nodes.length === 0) return;
  adoptMathStyles();
  for (const node of nodes) {
    katex.render(node.textContent ?? '', node, {
      displayMode: node.dataset['math'] === 'display',
      throwOnError: false,
      errorColor: 'var(--agi-ext-danger-text)',
      output: 'htmlAndMathml',
    });
  }
}

function buildCodeCopyButton(pre: HTMLPreElement): HTMLElement {
  const status = el('span', { class: 'sp-code-block__status', role: 'status' });
  const button = el('button', {
    class: 'sp-code-block__copy',
    type: 'button',
    title: t('spCodeCopy'),
    'aria-label': t('spCodeCopy'),
  });
  button.appendChild(renderIcon(Copy, 12));
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (state: 'idle' | 'copied' | 'failed'): void => {
    clearTimeout(resetTimer);
    const label = state === 'failed' ? t('spCodeCopyRetry') : t('spCodeCopy');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.dataset['state'] = state;
    status.textContent =
      state === 'failed' ? t('spCodeCopyFailed') : state === 'copied' ? t('spCodeCopied') : '';
    if (state === 'copied') resetTimer = setTimeout(() => setState('idle'), COPIED_RESET_MS);
  };
  button.addEventListener('click', () => {
    const write = navigator.clipboard?.writeText(pre.textContent ?? '');
    if (!write) {
      setState('failed');
      return;
    }
    write.then(
      () => setState('copied'),
      () => setState('failed'),
    );
  });
  return el('div', { class: 'sp-code-block__bar' }, status, button);
}

function addCodeCopyButtons(root: HTMLElement): void {
  for (const pre of root.querySelectorAll('pre')) {
    const block = el('div', { class: 'sp-code-block' });
    pre.replaceWith(block);
    block.append(buildCodeCopyButton(pre), pre);
  }
}

export function renderMarkdownInto(target: HTMLElement, text: string): void {
  target.innerHTML = sanitizeHtml(renderMarkdown(text));
  renderMath(target);
  addCodeCopyButtons(target);
}
