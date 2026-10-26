import DOMPurify from 'dompurify';
import markdownit from 'markdown-it';
import type { StateBlock, StateInline } from 'markdown-it';
import markdownItFootnote from 'markdown-it-footnote';
import {
  closeUnterminatedCodeFence,
  normalizeMarkdownSource,
} from '@agiworkforce/utils/markdown-source';
import {
  highlightToLines,
  resolveHighlightLanguage,
  type HighlightedLine,
} from '@agiworkforce/unified-chat/shiki-highlighter';
import { Copy, ImageIcon, ImageOff, renderIcon } from '../../assets/icons';
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
      'data-md-image',
      'data-lang',
      'data-fence-open',
      'data-task',
    ],
    ADD_URI_SAFE_ATTR: [
      'colspan',
      'rowspan',
      'start',
      'data-math',
      'data-md-image',
      'data-lang',
      'data-fence-open',
      'data-task',
    ],
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

const MERMAID_LANGUAGE = 'mermaid';
const CODE_LANGUAGE = /^[A-Za-z0-9+#._-]{1,32}$/;

function codeLanguage(info: string | undefined): string | null {
  const candidate = (info ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return CODE_LANGUAGE.test(candidate) ? candidate : null;
}

type RenderEnv = Record<string, unknown> & {
  docId: string;
  openFenceEndLine: number | null;
};

const renderCode = (content: string, language: string | null = null, open = false): string =>
  `<pre${language ? ` data-lang="${escapeText(language)}"` : ''}${open ? ' data-fence-open="true"' : ''}><code>${escapeText(content.replace(/\n$/, ''))}</code></pre>\n`;

function fenceIsOpen(map: [number, number] | null, env: unknown): boolean {
  const openFenceEndLine = (env as Partial<RenderEnv> | undefined)?.openFenceEndLine ?? null;
  return openFenceEndLine !== null && map !== null && map[1] >= openFenceEndLine;
}

md.renderer.rules['fence'] = (tokens, index, _options, env) => {
  const language = codeLanguage(tokens[index]?.info);
  return renderCode(
    tokens[index]?.content ?? '',
    language,
    language === MERMAID_LANGUAGE && fenceIsOpen(tokens[index]?.map ?? null, env),
  );
};

md.renderer.rules['code_block'] = (tokens, index) => renderCode(tokens[index]?.content ?? '');

md.renderer.rules['image'] = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const src = String(token.attrGet('src') ?? '');
  const label = escapeText(token.content || src);
  if (!SAFE_IMAGE_HREF.test(src)) return label;
  let linkDepth = 0;
  for (const previous of tokens.slice(0, index)) {
    if (previous.type === 'link_open') linkDepth += 1;
    else if (previous.type === 'link_close') linkDepth -= 1;
  }
  if (linkDepth > 0) return label;
  const title = String(token.attrGet('title') ?? '');
  return `<a href="${md.utils.escapeHtml(src)}" target="_blank" rel="noopener noreferrer" data-md-image="${escapeText(token.content)}"${title ? ` title="${escapeText(title)}"` : ''}>${label}</a>`;
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

const DISPLAY_FENCE = '$$';
const INLINE_FENCE = '$';
const WHITESPACE = /\s/u;
const WORD_OR_DIGIT = /[\p{L}\p{N}]/u;

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

md.inline.ruler.after('escape', 'math_inline', mathInline);
md.block.ruler.after('blockquote', 'math_block', mathBlock, {
  alt: ['paragraph', 'reference', 'blockquote', 'list'],
});

md.renderer.rules['math_inline'] = (tokens, index) =>
  `<span data-math="inline">${escapeText(tokens[index]?.content ?? '')}</span>`;
md.renderer.rules['math_inline_display'] = (tokens, index) =>
  `<span data-math="display">${escapeText((tokens[index]?.content ?? '').trim())}</span>`;
md.renderer.rules['math_block'] = (tokens, index) =>
  `<div data-math="display">${escapeText((tokens[index]?.content ?? '').trim())}</div>\n`;

const TASK_MARKER = /^\[([ xX])\]\s+/u;

md.core.ruler.push('side_panel_task_items', (state) => {
  const tokens = state.tokens;
  for (let index = 2; index < tokens.length; index += 1) {
    const inline = tokens[index];
    if (inline?.type !== 'inline' || !inline.children) continue;
    if (tokens[index - 1]?.type !== 'paragraph_open') continue;
    if (tokens[index - 2]?.type !== 'list_item_open') continue;
    const first = inline.children[0];
    if (first?.type !== 'text') continue;
    const marker = TASK_MARKER.exec(first.content);
    if (!marker) continue;
    first.content = first.content.slice(marker[0].length);
    const checkbox = new state.Token('task_checkbox', 'span', 0);
    checkbox.meta = { checked: marker[1] !== ' ' };
    inline.children.unshift(checkbox);
  }
});

md.renderer.rules['task_checkbox'] = (tokens, index) =>
  `<span data-task="${tokens[index]?.meta?.['checked'] ? 'done' : 'open'}"></span>`;

let renderSequence = 0;

export function renderMarkdown(text: string): string {
  renderSequence += 1;
  const source = normalizeMarkdownSource(text);
  const env: RenderEnv = {
    docId: `m${renderSequence}`,
    openFenceEndLine: closeUnterminatedCodeFence(text) !== text ? source.split('\n').length : null,
  };
  return md.render(source, env);
}

type Katex = typeof import('katex').default;

let katexLoad: Promise<Katex> | undefined;

function loadKatex(): Promise<Katex> {
  if (katexLoad) return katexLoad;
  const load = Promise.all([import('katex'), import('katex/dist/katex.min.css?inline')]).then(
    ([katexModule, styles]) => {
      adoptMathStyles(styles.default);
      return katexModule.default;
    },
  );
  katexLoad = load;
  load.catch(() => {
    if (katexLoad === load) katexLoad = undefined;
  });
  return load;
}

function adoptMathStyles(katexStyles: string): void {
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

function renderMath(root: HTMLElement): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-math]')];
  if (nodes.length === 0) return Promise.resolve();
  return loadKatex().then(
    (katex) => {
      for (const node of nodes) {
        katex.render(node.textContent ?? '', node, {
          displayMode: node.dataset['math'] === 'display',
          throwOnError: false,
          errorColor: 'var(--agi-ext-danger-text)',
          output: 'htmlAndMathml',
        });
      }
    },
    () => {
      for (const node of nodes) {
        node.dataset['mathSource'] = 'shown';
        node.title = t('spMathUnavailable');
      }
    },
  );
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
  const language = pre.dataset['lang'];
  const label = el('span', { class: 'sp-code-block__lang' }, language ?? '');
  return el('div', { class: 'sp-code-block__bar' }, label, status, button);
}

function paintHighlightedLines(code: HTMLElement, lines: readonly HighlightedLine[]): void {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    if (index > 0) fragment.appendChild(document.createTextNode('\n'));
    for (const token of line) {
      const span = document.createElement('span');
      span.className = 'shiki-token';
      span.textContent = token.content;
      for (const [property, value] of Object.entries(token.style)) {
        if (typeof value !== 'string') continue;
        if (property.startsWith('--')) span.style.setProperty(property, value);
        else
          span.style.setProperty(
            property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
            value,
          );
      }
      fragment.appendChild(span);
    }
  });
  code.replaceChildren(fragment);
}

function highlightCodeBlocks(root: HTMLElement): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLPreElement>('pre[data-lang]')].filter((pre) =>
    resolveHighlightLanguage(pre.dataset['lang'] ?? ''),
  );
  return Promise.all(
    blocks.map(async (pre) => {
      const code = pre.querySelector('code');
      if (!code) return;
      const source = code.textContent ?? '';
      const lines = await highlightToLines(source, pre.dataset['lang'] ?? '').catch(() => null);
      if (lines && pre.contains(code) && code.textContent === source)
        paintHighlightedLines(code, lines);
    }),
  ).then(() => undefined);
}

function addCodeCopyButtons(root: HTMLElement): void {
  for (const pre of root.querySelectorAll('pre')) {
    const block = el('div', { class: 'sp-code-block' });
    pre.replaceWith(block);
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', t('spCodeBlockLabel'));
    block.append(buildCodeCopyButton(pre), pre);
  }
}

const IMAGE_MAX_RETRIES = 2;
const REMOTE_IMAGE = /^https?:$/;
const approvedImageKeys = new Set<string>();

interface RemoteImage {
  src: string;
  key: string;
  host: string;
  alt: string;
  title: string;
}

function remoteImage(link: HTMLAnchorElement): RemoteImage | null {
  let url: URL;
  try {
    url = new URL(link.getAttribute('href') ?? '');
  } catch {
    return null;
  }
  if (!REMOTE_IMAGE.test(url.protocol)) return null;
  const key = new URL(url.href);
  key.hash = '';
  return {
    src: url.href,
    key: key.href,
    host: url.host,
    alt: link.dataset['mdImage'] ?? '',
    title: link.title,
  };
}

function imageNotice(): HTMLSpanElement {
  return el('span', { class: 'sp-md-image-notice' });
}

function buildBlockedImage(link: HTMLAnchorElement, image: RemoteImage): HTMLElement {
  const notice = imageNotice();
  notice.append(
    renderIcon(ImageIcon, 14),
    link,
    el('span', { class: 'sp-md-image-notice__host' }, t('spImageFrom', [image.host])),
  );
  const load = el(
    'button',
    {
      class: 'sp-md-image-button',
      type: 'button',
      'aria-label': t('spImageLoadLabel', [image.host]),
    },
    t('spImageLoad'),
  );
  load.addEventListener('click', () => {
    approvedImageKeys.add(image.key);
    const view = buildImageView(image, 0);
    notice.replaceWith(view);
    view.focus();
  });
  notice.appendChild(load);
  return notice;
}

function buildFailedImage(image: RemoteImage, attempt: number): HTMLElement {
  const notice = imageNotice();
  const failed = t('spImageFailed');
  notice.append(
    renderIcon(ImageOff, 14),
    el(
      'span',
      {
        class: 'sp-md-image-notice__label',
        role: 'img',
        'aria-label': image.alt ? t('spImageFailedLabel', [image.alt]) : failed,
      },
      image.alt || failed,
    ),
  );
  if (attempt < IMAGE_MAX_RETRIES) {
    const retry = el('button', { class: 'sp-md-image-button', type: 'button' }, t('spImageRetry'));
    retry.addEventListener('click', () => {
      const view = buildImageView(image, attempt + 1);
      notice.replaceWith(view);
      view.focus();
    });
    notice.appendChild(retry);
  }
  notice.appendChild(
    el(
      'a',
      {
        class: 'sp-md-image-download',
        href: image.src,
        target: '_blank',
        rel: 'noopener noreferrer',
        download: '',
      },
      t('spImageDownload'),
    ),
  );
  return notice;
}

function buildImageView(image: RemoteImage, attempt: number): HTMLAnchorElement {
  const open = t('spImageOpen');
  const view = el('a', {
    class: 'sp-md-image sp-md-image--loading',
    href: image.src,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: image.title || image.alt || open,
    'aria-label': image.alt ? t('spImageOpenLabel', [image.alt]) : open,
  });
  const img = el('img', {
    src: image.src,
    alt: image.alt,
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
  });
  if (image.title) img.title = image.title;
  img.addEventListener('load', () => view.classList.remove('sp-md-image--loading'));
  img.addEventListener('error', () => view.replaceWith(buildFailedImage(image, attempt)));
  view.appendChild(img);
  return view;
}

function addRemoteImages(root: HTMLElement): void {
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-md-image]')) {
    if (link.parentElement?.closest('a')) continue;
    const image = remoteImage(link);
    if (!image) continue;
    if (approvedImageKeys.has(image.key)) {
      link.replaceWith(buildImageView(image, 0));
      continue;
    }
    const parent = link.parentNode;
    const next = link.nextSibling;
    parent?.insertBefore(buildBlockedImage(link, image), next);
  }
}

function addTaskCheckboxes(root: HTMLElement): void {
  for (const marker of root.querySelectorAll<HTMLElement>('span[data-task]')) {
    const checkbox = el('input', { class: 'sp-task-checkbox', type: 'checkbox' });
    checkbox.checked = marker.dataset['task'] === 'done';
    checkbox.disabled = true;
    marker.closest('li')?.classList.add('sp-task-item');
    marker.replaceWith(checkbox);
  }
}

type Mermaid = typeof import('mermaid').default;

const SVG_TYPE = 'image/svg+xml';
const DIAGRAM_CACHE_LIMIT = 32;
let mermaidLoad: Promise<Mermaid> | undefined;
let mermaidTheme: 'dark' | 'default' | null = null;
let diagramSequence = 0;
const diagramCache = new Map<string, string | null>();
const diagramPending = new Map<string, Promise<string | null>>();

function prefersDarkPanel(): boolean {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function loadMermaid(theme: 'dark' | 'default'): Promise<Mermaid> {
  const load = (mermaidLoad ??= import('mermaid').then((module) => module.default));
  load.catch(() => {
    if (mermaidLoad === load) mermaidLoad = undefined;
  });
  return load.then((mermaid) => {
    if (mermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme,
        htmlLabels: false,
        fontFamily: getComputedStyle(document.body).fontFamily,
        flowchart: { htmlLabels: false, useMaxWidth: false },
        class: { htmlLabels: false },
        suppressErrorRendering: true,
      });
      mermaidTheme = theme;
    }
    return mermaid;
  });
}

function standaloneSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, SVG_TYPE);
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('invalid svg');
  const [, , width, height] = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (width !== undefined && height !== undefined && width > 0 && height > 0) {
    root.setAttribute('width', String(Math.ceil(width)));
    root.setAttribute('height', String(Math.ceil(height)));
  }
  root.removeAttribute('style');
  return new XMLSerializer().serializeToString(root);
}

function rememberDiagram(key: string, image: string | null): void {
  diagramCache.delete(key);
  diagramCache.set(key, image);
  while (diagramCache.size > DIAGRAM_CACHE_LIMIT) {
    const oldest = diagramCache.keys().next();
    if (oldest.done) break;
    diagramCache.delete(oldest.value);
  }
}

function diagramImage(source: string, theme: 'dark' | 'default'): Promise<string | null> {
  const key = `${theme}\u0000${source}`;
  if (diagramCache.has(key)) return Promise.resolve(diagramCache.get(key) ?? null);
  let pending = diagramPending.get(key);
  if (pending) return pending;
  pending = (async (): Promise<string | null> => {
    const host = el('div', { class: 'sp-mermaid-host', 'aria-hidden': 'true' });
    document.body.appendChild(host);
    try {
      const mermaid = await loadMermaid(theme);
      diagramSequence += 1;
      const { svg } = await mermaid.render(`sp-mermaid-${diagramSequence}`, source, host);
      return `data:${SVG_TYPE};charset=utf-8,${encodeURIComponent(standaloneSvg(svg))}`;
    } catch {
      return null;
    } finally {
      host.remove();
    }
  })().then((image) => {
    diagramPending.delete(key);
    rememberDiagram(key, image);
    return image;
  });
  diagramPending.set(key, pending);
  return pending;
}

function showDiagram(block: HTMLElement, image: string): void {
  const figure = el('figure', { class: 'sp-mermaid' });
  figure.appendChild(el('img', { src: image, alt: t('spDiagramLabel') }));
  const toggle = el(
    'button',
    { class: 'sp-mermaid__toggle', type: 'button', 'aria-expanded': 'false' },
    t('spDiagramShowSource'),
  );
  toggle.addEventListener('click', () => {
    const showing = block.hidden;
    block.hidden = !showing;
    toggle.textContent = showing ? t('spDiagramHideSource') : t('spDiagramShowSource');
    toggle.setAttribute('aria-expanded', String(showing));
  });
  figure.appendChild(toggle);
  block.before(figure);
  block.hidden = true;
}

function renderDiagrams(root: HTMLElement): Promise<void> {
  const theme = prefersDarkPanel() ? 'dark' : 'default';
  const blocks = [
    ...root.querySelectorAll<HTMLPreElement>(`pre[data-lang="${MERMAID_LANGUAGE}"]`),
  ].filter((pre) => pre.dataset['fenceOpen'] === undefined);
  return Promise.all(
    blocks.map(async (pre) => {
      const source = pre.textContent ?? '';
      const block = pre.closest<HTMLElement>('.sp-code-block') ?? pre;
      if (!source.trim()) return;
      const image = await diagramImage(source, theme);
      if (image && block.isConnected && pre.textContent === source) showDiagram(block, image);
    }),
  ).then(() => undefined);
}

export function renderMarkdownInto(target: HTMLElement, text: string): Promise<void> {
  target.innerHTML = sanitizeHtml(renderMarkdown(text));
  addTaskCheckboxes(target);
  addCodeCopyButtons(target);
  addRemoteImages(target);
  return Promise.all([
    renderMath(target),
    highlightCodeBlocks(target),
    renderDiagrams(target),
  ]).then(() => undefined);
}
