import markdownit from 'markdown-it';
import DOMPurify from 'dompurify';
import { findPathReferences } from '../utils/pathReferences';

const md = markdownit({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

function renderCodeBlock(content: string, language = ''): string {
  const languageClass = language ? ` class="language-${md.utils.escapeHtml(language)}"` : '';
  return [
    '<div class="code-block-wrapper">',
    '<div class="code-block-actions">',
    '<button type="button" class="copy-btn" aria-label="Copy code">Copy</button>',
    '<button type="button" class="apply-btn" aria-label="Apply code changes">Apply</button>',
    '</div>',
    `<pre><code${languageClass}>${md.utils.escapeHtml(content)}</code></pre>`,
    '</div>',
    '',
  ].join('\n');
}

md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  if (!token) return '';
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
  const language = info ? info.split(/\s+/u, 1)[0] : '';
  return renderCodeBlock(token.content, language);
};

md.renderer.rules.code_block = (tokens, index) => {
  const token = tokens[index];
  return token ? renderCodeBlock(token.content) : '';
};

export const PURIFY_CONFIG: DOMPurify.Config = {
  FORBID_TAGS: [
    'img',
    'picture',
    'svg',
    'math',
    'audio',
    'video',
    'source',
    'iframe',
    'object',
    'embed',
    'form',
    'link',
    'meta',
    'base',
    'style',
    'script',
  ],
  FORBID_ATTR: ['style', 'formaction', 'srcdoc', 'onload', 'onerror', 'onclick'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target', 'rel'],
};

declare global {
  interface Window {
    agiRender?: (markdown: string) => string;
    DOMPurify?: typeof DOMPurify;
  }
}

export const PATH_LINK_CLASS = 'path-link';

/**
 * Turn `src/app.ts:12:4` in already-sanitized model output into a span the
 * sidebar script can hand back to the extension host. The pass runs after
 * DOMPurify so nothing here widens what the sanitizer allowed, and it skips
 * text already inside an anchor.
 */
function linkifyPathReferences(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (parent === null || parent.closest('a') !== null) continue;
    const references = findPathReferences(textNode.data);
    if (references.length === 0) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const reference of references) {
      if (reference.start < cursor) continue;
      fragment.appendChild(document.createTextNode(textNode.data.slice(cursor, reference.start)));
      const span = document.createElement('span');
      span.className = PATH_LINK_CLASS;
      span.setAttribute('role', 'link');
      span.setAttribute('tabindex', '0');
      span.dataset['path'] = reference.path;
      if (reference.line !== undefined) span.dataset['line'] = String(reference.line);
      if (reference.column !== undefined) span.dataset['column'] = String(reference.column);
      const end = reference.start + reference.length;
      span.textContent = textNode.data.slice(reference.start, end);
      fragment.appendChild(span);
      cursor = end;
    }
    fragment.appendChild(document.createTextNode(textNode.data.slice(cursor)));
    textNode.replaceWith(fragment);
  }
}

function render(markdown: string): string {
  if (typeof markdown !== 'string') return '';
  const html = md.render(markdown);
  const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  linkifyPathReferences(template.content);
  return template.innerHTML;
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (
    node.tagName === 'BUTTON' &&
    (node.classList.contains('copy-btn') || node.classList.contains('apply-btn'))
  ) {
    node.setAttribute('type', 'button');
  }
});

window.agiRender = render;
window.DOMPurify = DOMPurify;
